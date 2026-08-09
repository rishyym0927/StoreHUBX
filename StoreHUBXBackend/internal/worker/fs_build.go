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
	"time"

	"github.com/rishyym0927/storehubx/internal/models"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// buildStepTimeout bounds each npm command so a stalled install/build
// (network hang, stuck postinstall script, etc.) fails the job instead of
// wedging the worker's single-threaded processing loop forever.
const buildStepTimeout = 5 * time.Minute

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
			stepCtx, cancel := context.WithTimeout(ctx, buildStepTimeout)
			defer cancel()

			cmd := exec.CommandContext(stepCtx, c[0], c[1:]...)
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
				if stepCtx.Err() == context.DeadlineExceeded {
					return fmt.Errorf("%v timed out after %s", c, buildStepTimeout)
				}
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

// modifyIndexHTMLOnDisk injects StoreHUBX metadata (component name/version/id,
// build timestamp) into index.html's <head>, in place on disk, before the S3
// uploader reads it.
func modifyIndexHTMLOnDisk(ctx context.Context, jobID primitive.ObjectID, indexPath string, job *models.BuildJob, logFunc func(context.Context, primitive.ObjectID, string)) error {
	content, err := os.ReadFile(indexPath)
	if err != nil {
		return fmt.Errorf("index.html not found: %w", err)
	}
	modified := string(content)

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

	if i := strings.Index(modified, "</head>"); i != -1 {
		modified = modified[:i] + metaTags + "\n" + configScript + "\n" + modified[i:]
	}

	if err := os.WriteFile(indexPath, []byte(modified), 0644); err != nil {
		return fmt.Errorf("failed to write modified index.html: %w", err)
	}

	logFunc(ctx, jobID, "injected component metadata into index.html")
	return nil
}
