package main

import (
	"bytes"
	"context"
	"fmt"
	"io/ioutil"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"golang.org/x/net/html"
)

// MinioFixer is a direct client for fixing MinIO objects
type MinioFixer struct {
	client     *minio.Client
	bucket     string
	publicBase string
}

// NewMinioFixer creates a new fixer instance
func NewMinioFixer() (*MinioFixer, error) {
	rawEndpoint := os.Getenv("S3_ENDPOINT")
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

// FixHTMLURLs fixes paths in HTML files to use correct relative URLs for assets
func (m *MinioFixer) FixHTMLURLs(ctx context.Context, htmlContent []byte, componentPath string) ([]byte, bool) {
	doc, err := html.Parse(bytes.NewReader(htmlContent))
	if err != nil {
		fmt.Printf("Error parsing HTML: %v\n", err)
		return htmlContent, false
	}

	bucket := m.bucket
	changed := false

	// This function walks the HTML DOM and updates URLs
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			for i := range n.Attr {
				attr := &n.Attr[i]
				key := strings.ToLower(attr.Key)

				// Only process href and src attributes
				if key != "src" && key != "href" {
					continue
				}

				val := attr.Val
				originalVal := val

				// Fix URLs with localhost/domain but missing component path
				// Example: "http://localhost:9000/assets/" should be "http://localhost:9000/bucket/componentPath/assets/"
				if (strings.Contains(val, "http://") || strings.Contains(val, "https://")) && strings.Contains(val, "/assets/") {
					u, err := url.Parse(val)
					if err == nil {
						// Extract the path after /assets/
						pathParts := strings.Split(u.Path, "/assets/")
						if len(pathParts) == 2 {
							assetPath := pathParts[1]

							// Construct the correct path with bucket and component path
							newPath := fmt.Sprintf("/%s/%s/assets/%s", bucket, componentPath, assetPath)
							u.Path = newPath
							attr.Val = u.String()

							if attr.Val != originalVal {
								changed = true
								fmt.Printf("Fixed URL: %s -> %s\n", originalVal, attr.Val)
							}
							continue
						}
					}
				}

				// Fix relative paths like /assets/ to include the bucket and component path
				if strings.HasPrefix(val, "/assets/") {
					attr.Val = fmt.Sprintf("/%s/%s/assets/%s", bucket, componentPath, strings.TrimPrefix(val, "/assets/"))
					if attr.Val != originalVal {
						changed = true
						fmt.Printf("Fixed relative URL: %s -> %s\n", originalVal, attr.Val)
					}
					continue
				}

				// Fix relative paths that don't start with slash
				if strings.HasPrefix(val, "assets/") {
					attr.Val = fmt.Sprintf("/%s/%s/%s", bucket, componentPath, val)
					if attr.Val != originalVal {
						changed = true
						fmt.Printf("Fixed relative URL without slash: %s -> %s\n", originalVal, attr.Val)
					}
					continue
				}
			}
		}

		// Process all child nodes
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}

	walk(doc)

	if !changed {
		return htmlContent, false
	}

	// Render the HTML back to bytes
	var buf bytes.Buffer
	if err := html.Render(&buf, doc); err != nil {
		fmt.Printf("Error rendering HTML: %v\n", err)
		return htmlContent, false
	}

	return buf.Bytes(), true
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

	fmt.Printf("Fixing HTML URLs for files in bucket %s\n", bucket)

	// Set up context
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	// Get a list of all HTML objects in the components directory
	objects, err := fixer.ListObjects(ctx, "components/")
	if err != nil {
		fmt.Printf("Error listing objects: %v\n", err)
		os.Exit(1)
	}

	// Filter for HTML files
	htmlFiles := make([]string, 0)
	for _, key := range objects {
		if strings.HasSuffix(strings.ToLower(key), ".html") {
			htmlFiles = append(htmlFiles, key)
		}
	}

	fmt.Printf("Found %d HTML files to check\n", len(htmlFiles))
	fixedFiles := 0

	// Process each HTML file
	for _, htmlKey := range htmlFiles {
		// Get component path from the HTML file path
		// Format: components/{component}/{version}/index.html
		pathParts := strings.Split(htmlKey, "/")
		if len(pathParts) < 4 {
			fmt.Printf("Skipping %s - unexpected path format\n", htmlKey)
			continue
		}

		// Extract the component and version parts from the path
		componentParts := pathParts[1 : len(pathParts)-1] // Skip "components/" at start and filename at end
		componentPath := strings.Join(componentParts, "/")

		// Get HTML content
		contentBytes, err := fixer.GetObject(ctx, htmlKey)
		if err != nil {
			fmt.Printf("Error getting HTML content for %s: %v\n", htmlKey, err)
			continue
		}

		// Fix URLs in the HTML content
		fixedContent, wasChanged := fixer.FixHTMLURLs(ctx, contentBytes, componentPath)

		if wasChanged {
			// Update the HTML file with fixed content
			err = fixer.UpdateObject(ctx, htmlKey, fixedContent, "text/html")
			if err != nil {
				fmt.Printf("Error updating HTML content for %s: %v\n", htmlKey, err)
			} else {
				fixedFiles++
				fmt.Printf("Updated %s with fixed URLs\n", htmlKey)
			}
		} else {
			fmt.Printf("No URL fixes needed for %s\n", htmlKey)
		}
	}

	fmt.Printf("Finished URL fixing. Fixed %d HTML files out of %d total.\n", fixedFiles, len(htmlFiles))
}
