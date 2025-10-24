package main

import (
	"bytes"
	"context"
	"fmt"
	"io/ioutil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// MinioFixer is a direct client for fixing MinIO objects
type MinioFixer struct {
	client     *minio.Client
	bucket     string
	publicBase string
}

// NewMinioFixer creates a new fixer instance
func NewMinioFixer() (*MinioFixer, error) {
	rawEndpoint := os.Getenv("S3_ENDPOINT") // can be "localhost:9000" or "http://localhost:9000"
	ak := os.Getenv("AWS_ACCESS_KEY_ID")
	sk := os.Getenv("AWS_SECRET_ACCESS_KEY")
	bucket := os.Getenv("S3_BUCKET")
	public := os.Getenv("S3_PUBLIC_BASE_URL")

	if rawEndpoint == "" || ak == "" || sk == "" || bucket == "" || public == "" {
		return nil, fmt.Errorf("missing S3 configuration (S3_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET, S3_PUBLIC_BASE_URL)")
	}

	// Parse endpoint to support both "host:port" and full URL forms.
	secure := false
	endpoint := rawEndpoint

	// If it looks like a URL (has scheme), parse it
	if strings.Contains(rawEndpoint, "://") {
		u, err := url.Parse(rawEndpoint)
		if err != nil {
			return nil, fmt.Errorf("invalid S3_ENDPOINT: %w", err)
		}
		secure = (u.Scheme == "https")
		if u.Path != "" && u.Path != "/" {
			return nil, fmt.Errorf("S3_ENDPOINT must not include a path; got %q", rawEndpoint)
		}
		endpoint = u.Host // host[:port]
	} else {
		// no scheme provided; default http
		secure = false
	}

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(ak, sk, ""),
		Secure: secure,
	})
	if err != nil {
		return nil, err
	}

	u := &MinioFixer{client: client, bucket: bucket, publicBase: strings.TrimRight(public, "/")}
	// Ensure bucket exists
	exists, err := client.BucketExists(context.Background(), bucket)
	if err != nil {
		return nil, fmt.Errorf("checking bucket existence failed: %w", err)
	}
	if !exists {
		return nil, fmt.Errorf("bucket %s does not exist", bucket)
	}

	return u, nil
}

// ListObjects lists all objects with the given prefix
func (m *MinioFixer) ListObjects(ctx context.Context, prefix string) ([]string, error) {
	opts := minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	}

	var objects []string
	for object := range m.client.ListObjects(ctx, m.bucket, opts) {
		if object.Err != nil {
			return nil, object.Err
		}
		objects = append(objects, object.Key)
	}

	return objects, nil
}

// GetObject retrieves an object's content
func (m *MinioFixer) GetObject(ctx context.Context, key string) ([]byte, error) {
	obj, err := m.client.GetObject(ctx, m.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get object: %w", err)
	}
	defer obj.Close()

	content, err := ioutil.ReadAll(obj)
	if err != nil {
		return nil, fmt.Errorf("failed to read object content: %w", err)
	}

	return content, nil
}

// UpdateObjectContentType updates the content type of an existing object
func (m *MinioFixer) UpdateObjectContentType(ctx context.Context, key string, contentType string) error {
	// Get the object's data
	content, err := m.GetObject(ctx, key)
	if err != nil {
		return fmt.Errorf("failed to get object content: %w", err)
	}

	// Debug log for content type update
	fmt.Printf("Updating content type for %s to %s\n", key, contentType)

	// Upload with the correct content type
	opts := minio.PutObjectOptions{
		ContentType: contentType,
	}

	// Put the object back with the new content type
	_, err = m.client.PutObject(
		ctx,
		m.bucket,
		key,
		bytes.NewReader(content),
		int64(len(content)),
		opts,
	)

	if err != nil {
		return fmt.Errorf("failed to update object with new content type: %w", err)
	}

	return nil
}

// UpdateObject updates an object's content and content type
func (m *MinioFixer) UpdateObject(ctx context.Context, key string, content []byte, contentType string) error {
	// Upload with the given content and content type
	opts := minio.PutObjectOptions{
		ContentType: contentType,
	}

	// Put the object
	_, err := m.client.PutObject(
		ctx,
		m.bucket,
		key,
		bytes.NewReader(content),
		int64(len(content)),
		opts,
	)

	if err != nil {
		return fmt.Errorf("failed to update object: %w", err)
	}

	return nil
}

func main() {
	// Load environment variables from .env file if it exists
	if err := godotenv.Load(); err != nil {
		fmt.Println("No .env file found, using environment variables")
	}

	// Create MinIO fixer
	fixer, err := NewMinioFixer()
	if err != nil {
		fmt.Printf("Failed to initialize MinIO fixer: %v\n", err)
		os.Exit(1)
	}

	// Get bucket name from environment
	bucket := os.Getenv("S3_BUCKET")
	if bucket == "" {
		fmt.Println("S3_BUCKET environment variable is not set")
		os.Exit(1)
	}

	fmt.Printf("Fixing MIME types for files in bucket %s\n", bucket)

	// List all objects in the bucket that might need fixing
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	// Get a list of all objects in the components directory
	objects, err := fixer.ListObjects(ctx, "components/")
	if err != nil {
		fmt.Printf("Error listing objects: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Found %d files to check\n", len(objects))

	// Process each file based on its extension
	fixed := 0
	htmlFiles := make([]string, 0) // Track HTML files to fix paths later

	for _, key := range objects {
		ext := strings.ToLower(filepath.Ext(key))

		var contentType string
		switch ext {
		case ".js":
			contentType = "application/javascript"
		case ".css":
			contentType = "text/css"
		case ".html":
			contentType = "text/html"
			htmlFiles = append(htmlFiles, key) // Track HTML files for path fixing
		case ".svg":
			contentType = "image/svg+xml"
		case ".json":
			contentType = "application/json"
		case ".png":
			contentType = "image/png"
		case ".jpg", ".jpeg":
			contentType = "image/jpeg"
		case ".gif":
			contentType = "image/gif"
		case ".woff":
			contentType = "font/woff"
		case ".woff2":
			contentType = "font/woff2"
		case ".ttf":
			contentType = "font/ttf"
		case ".map":
			contentType = "application/json" // Sourcemaps are JSON
		default:
			continue // Skip files with unknown extensions
		}

		// Only update content type for known file types
		if contentType != "" {
			fmt.Printf("Fixing MIME type for %s to %s\n", key, contentType)
			if err := fixer.UpdateObjectContentType(ctx, key, contentType); err != nil {
				fmt.Printf("Error updating content type for %s: %v\n", key, err)
			} else {
				fixed++
			}
		}
	}

	// Fix HTML files to use correct asset paths
	fmt.Printf("Checking %d HTML files for incorrect asset paths\n", len(htmlFiles))
	fixedPaths := 0

	for _, htmlKey := range htmlFiles {
		// Get component directory from path
		dirParts := strings.Split(htmlKey, "/")
		if len(dirParts) < 4 {
			continue // Not in expected format: components/name/version/index.html
		}

		componentPath := strings.Join(dirParts[:len(dirParts)-1], "/") // Get path without the filename

		// Get HTML content
		contentBytes, err := fixer.GetObject(ctx, htmlKey)
		if err != nil {
			fmt.Printf("Error getting HTML content for %s: %v\n", htmlKey, err)
			continue
		}

		content := string(contentBytes)

		// Replace incorrect asset paths with correct ones
		// Look for references like "http://localhost:9000/assets/" that should be
		// "http://localhost:9000/storehub-bundles/componentPath/assets/"
		originalContent := content

		// Fix absolute URLs that don't contain the full path
		incorrectBase := `"/assets/`
		correctBase := fmt.Sprintf(`"/%s/%s/assets/`, bucket, componentPath)
		content = strings.ReplaceAll(content, incorrectBase, correctBase)

		// Fix URLs with localhost but wrong path
		incorrectFullPath := `"http://localhost:9000/assets/`
		correctFullPath := fmt.Sprintf(`"http://localhost:9000/%s/%s/assets/`, bucket, componentPath)
		content = strings.ReplaceAll(content, incorrectFullPath, correctFullPath)

		// Update the content if it was changed
		if content != originalContent {
			fmt.Printf("Fixing asset paths in %s\n", htmlKey)

			// Put the object back with corrected content
			err = fixer.UpdateObject(ctx, htmlKey, []byte(content), "text/html")

			if err != nil {
				fmt.Printf("Error updating HTML content for %s: %v\n", htmlKey, err)
			} else {
				fixedPaths++
			}
		}
	}

	fmt.Printf("MIME type fixing complete. Fixed %d files. Fixed paths in %d HTML files.\n", fixed, fixedPaths)
}
