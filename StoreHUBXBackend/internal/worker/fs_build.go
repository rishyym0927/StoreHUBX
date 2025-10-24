package worker

import (
	"archive/zip"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/rishyym0927/storehubx/internal/models"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func unzip(srcZip, destDir string) (string, error) {
	r, err := zip.OpenReader(srcZip)
	if err != nil {
		return "", err
	}
	defer r.Close()

	var topDir string

	for _, f := range r.File {
		fpath := filepath.Join(destDir, f.Name)
		// remember the zipball top-level dir (GitHub names it owner-repo-sha/)
		if topDir == "" {
			parts := strings.Split(f.Name, "/")
			if len(parts) > 0 {
				topDir = filepath.Join(destDir, parts[0])
			}
		}
		if f.FileInfo().IsDir() {
			os.MkdirAll(fpath, 0o755)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(fpath), 0o755); err != nil {
			return "", err
		}
		rc, err := f.Open()
		if err != nil {
			return "", err
		}
		out, err := os.Create(fpath)
		if err != nil {
			rc.Close()
			return "", err
		}
		_, err = io.Copy(out, rc)
		rc.Close()
		out.Close()
		if err != nil {
			return "", err
		}
	}
	return topDir, nil
}

func (p *Processor) maybeBuildWithNode(ctx context.Context, jobID primitive.ObjectID, workingDir string) error {
	// if package.json exists, try a standard build
	if _, err := os.Stat(filepath.Join(workingDir, "package.json")); err == nil {
		cmds := [][]string{
			{"npm", "ci"},
			{"npm", "run", "build"},
		}
		for _, c := range cmds {
			cmd := exec.Command(c[0], c[1:]...)
			cmd.Dir = workingDir

			// Create pipes for capturing stdout and stderr
			outPipe, _ := cmd.StdoutPipe()
			errPipe, _ := cmd.StderrPipe()

			// Start the command
			if err := cmd.Start(); err != nil {
				return fmt.Errorf("failed to start command %v: %w", c, err)
			}

			// Create a channel to signal when the reading is done
			done := make(chan bool)

			// Capture stdout in a goroutine
			go func() {
				buf := make([]byte, 1024)
				for {
					n, err := outPipe.Read(buf)
					if n > 0 {
						output := string(buf[:n])
						fmt.Print(output) // Still print to console

						// Now properly log to database
						p.logPush(ctx, jobID, fmt.Sprintf("[%s] %s", c[0], strings.TrimSpace(output)))
					}
					if err != nil {
						break
					}
				}
				done <- true
			}()

			// Capture stderr in another goroutine
			go func() {
				buf := make([]byte, 1024)
				for {
					n, err := errPipe.Read(buf)
					if n > 0 {
						output := string(buf[:n])
						fmt.Print(output) // Still print to console

						// Now properly log to database
						p.logPush(ctx, jobID, fmt.Sprintf("[%s ERROR] %s", c[0], strings.TrimSpace(output)))
					}
					if err != nil {
						break
					}
				}
				done <- true
			}()

			// Wait for both stdout and stderr to be fully read
			<-done
			<-done

			// Wait for the command to finish
			if err := cmd.Wait(); err != nil {
				return fmt.Errorf("node build failed on %v: %w", c, err)
			}
		}
		// prefer dist/ or build/ as output
		if _, err := os.Stat(filepath.Join(workingDir, "dist")); err == nil {
			return nil
		}
		if _, err := os.Stat(filepath.Join(workingDir, "build")); err == nil {
			return nil
		}
	}
	// fallback: if there is an index.html, we can ship that folder as-is
	if _, err := os.Stat(filepath.Join(workingDir, "index.html")); err == nil {
		return nil
	}
	// else: nothing to publish (worker will mark error)
	return fmt.Errorf("no build output found (need package.json+build or index.html)")
}

func pickOutputDir(workingDir string) (string, error) {
	for _, cand := range []string{"dist", "build", "."} {
		p := filepath.Join(workingDir, cand)
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	return "", fmt.Errorf("no output directory")
}

// detectContentType returns MIME type for a file based on extension
func detectContentType(pathOrName string) string {
	ext := strings.ToLower(filepath.Ext(pathOrName))
	switch ext {
	case ".js":
		return "application/javascript"
	case ".mjs":
		return "application/javascript"
	case ".css":
		return "text/css"
	case ".html", ".htm":
		return "text/html"
	case ".svg":
		return "image/svg+xml"
	case ".json":
		return "application/json"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".ico":
		return "image/x-icon"
	case ".woff":
		return "font/woff"
	case ".woff2":
		return "font/woff2"
	case ".ttf":
		return "font/ttf"
	case ".eot":
		return "application/vnd.ms-fontobject"
	case ".otf":
		return "font/otf"
	case ".map":
		return "application/json"
	case ".txt":
		return "text/plain"
	case ".xml":
		return "application/xml"
	default:
		return "application/octet-stream"
	}
}

// modifyIndexHTMLOnDisk edits index.html IN PLACE on disk before S3 upload
// This ensures the S3 uploader reads our modified version
func modifyIndexHTMLOnDisk(ctx context.Context, jobID primitive.ObjectID, indexPath string, job *models.BuildJob, logFunc func(context.Context, primitive.ObjectID, string)) error {
	logFunc(ctx, jobID, fmt.Sprintf("[DEBUG] Starting index.html modification: %s", indexPath))

	// Check if file exists
	if _, err := os.Stat(indexPath); err != nil {
		logFunc(ctx, jobID, fmt.Sprintf("[DEBUG] index.html not found at %s: %v", indexPath, err))
		return fmt.Errorf("index.html not found: %w", err)
	}

	// Read current content
	content, err := os.ReadFile(indexPath)
	if err != nil {
		logFunc(ctx, jobID, fmt.Sprintf("[DEBUG] Failed to read index.html: %v", err))
		return fmt.Errorf("failed to read index.html: %w", err)
	}

	originalSize := len(content)
	logFunc(ctx, jobID, fmt.Sprintf("[DEBUG] Read index.html, size: %d bytes", originalSize))

	modified := string(content)

	// Count absolute paths BEFORE modification
	absolutePathsBefore := strings.Count(modified, `"/assets/`) + strings.Count(modified, `'/assets/`)
	logFunc(ctx, jobID, fmt.Sprintf("[DEBUG] Absolute asset paths found BEFORE edit: %d", absolutePathsBefore))

	// Log current DOCTYPE status
	hasDoctype := strings.Contains(modified, "<!DOCTYPE") || strings.Contains(modified, "<!doctype")
	logFunc(ctx, jobID, fmt.Sprintf("[DEBUG] Has DOCTYPE before edit: %t", hasDoctype))

	// Add custom meta tags in <head>
	metaTags := fmt.Sprintf(`
    <!-- StoreHUBX Component Metadata -->
    <meta name="component-name" content="%s">
    <meta name="component-version" content="%s">
    <meta name="build-timestamp" content="%s">
    <meta name="component-id" content="%s">`,
		job.Component,
		job.Version,
		job.CreatedAt.Format("2006-01-02T15:04:05Z"),
		job.ComponentID.Hex(),
	)

	// Add environment config script
	configScript := fmt.Sprintf(`
    <script>
        window.__STOREHUBX_COMPONENT__ = {
            name: "%s",
            version: "%s",
            componentId: "%s",
            buildTimestamp: "%s"
        };
    </script>`,
		job.Component,
		job.Version,
		job.ComponentID.Hex(),
		job.CreatedAt.Format("2006-01-02T15:04:05Z"),
	)

	// Insert before </head>
	headCloseIndex := strings.Index(modified, "</head>")
	if headCloseIndex != -1 {
		modified = modified[:headCloseIndex] + metaTags + "\n" + configScript + "\n" + modified[headCloseIndex:]
		logFunc(ctx, jobID, "[DEBUG] Successfully inserted meta tags and config script before </head>")
	} else {
		logFunc(ctx, jobID, "[DEBUG] Warning: </head> tag not found, skipping meta tag insertion")
	}

	modifiedSize := len(modified)
	logFunc(ctx, jobID, fmt.Sprintf("[DEBUG] Modified content size: %d bytes (diff: %+d)", modifiedSize, modifiedSize-originalSize))

	// Count absolute paths AFTER our modification (should be same as before)
	absolutePathsAfter := strings.Count(modified, `"/assets/`) + strings.Count(modified, `'/assets/`)
	logFunc(ctx, jobID, fmt.Sprintf("[DEBUG] Absolute asset paths found AFTER edit: %d (should be unchanged)", absolutePathsAfter))

	// Write back to disk BEFORE S3 upload reads it
	if err := os.WriteFile(indexPath, []byte(modified), 0644); err != nil {
		logFunc(ctx, jobID, fmt.Sprintf("[DEBUG] Failed to write modified index.html: %v", err))
		return fmt.Errorf("failed to write modified index.html: %w", err)
	}

	// Verify the write
	verifyContent, err := os.ReadFile(indexPath)
	if err != nil {
		logFunc(ctx, jobID, fmt.Sprintf("[DEBUG] Failed to verify written file: %v", err))
		return fmt.Errorf("failed to verify written file: %w", err)
	}

	verifySize := len(verifyContent)
	if verifySize != modifiedSize {
		logFunc(ctx, jobID, fmt.Sprintf("[DEBUG] ERROR: Written file size mismatch! Expected %d, got %d", modifiedSize, verifySize))
		return fmt.Errorf("file write verification failed: size mismatch")
	}

	logFunc(ctx, jobID, fmt.Sprintf("[DEBUG] ✓ Successfully wrote and verified modified index.html (%d bytes)", verifySize))
	logFunc(ctx, jobID, "[DEBUG] Note: S3 uploader will now read this modified version and rewrite absolute paths to relative")

	return nil
}
