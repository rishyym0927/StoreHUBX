package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"golang.org/x/net/html"
)

// S3Uploader uploads files to S3/MinIO with correct Content-Type handling.
type S3Uploader struct {
	client     *minio.Client
	bucket     string
	publicBase string
}

// NewS3Uploader creates a configured uploader. Expects environment variables:
// S3_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET, S3_PUBLIC_BASE_URL
func NewS3Uploader() (*S3Uploader, error) {
	rawEndpoint := os.Getenv("S3_ENDPOINT")
	ak := os.Getenv("AWS_ACCESS_KEY_ID")
	sk := os.Getenv("AWS_SECRET_ACCESS_KEY")
	bucket := os.Getenv("S3_BUCKET")
	public := os.Getenv("S3_PUBLIC_BASE_URL")

	if rawEndpoint == "" || ak == "" || sk == "" || bucket == "" || public == "" {
		return nil, fmt.Errorf("missing S3 configuration (S3_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET, S3_PUBLIC_BASE_URL)")
	}

	// parse endpoint to allow host:port or full URL
	secure := false
	endpoint := rawEndpoint
	if strings.Contains(rawEndpoint, "://") {
		u, err := url.Parse(rawEndpoint)
		if err != nil {
			return nil, fmt.Errorf("invalid S3_ENDPOINT: %w", err)
		}
		secure = u.Scheme == "https"
		if u.Path != "" && u.Path != "/" {
			return nil, fmt.Errorf("S3_ENDPOINT must not include a path; got %q", rawEndpoint)
		}
		endpoint = u.Host
	}

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(ak, sk, ""),
		Secure: secure,
	})
	if err != nil {
		return nil, err
	}

	u := &S3Uploader{client: client, bucket: bucket, publicBase: strings.TrimRight(public, "/")}

	// ensure bucket exists
	ctx := context.Background()
	exists, err := client.BucketExists(ctx, bucket)
	if err != nil {
		return nil, fmt.Errorf("checking bucket existence failed: %w", err)
	}
	if !exists {
		if err := client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("creating bucket %q failed: %w", bucket, err)
		}
	}

	// best-effort policy set
	_ = client.SetBucketPolicy(ctx, bucket, fmt.Sprintf(`{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":"*","Action":["s3:GetObject","s3:ListBucket"],"Resource":["arn:aws:s3:::%s/*","arn:aws:s3:::%s"]}]}`, bucket, bucket))

	return u, nil
}

// PublishComponentFromDist mirrors the entire build output directory to
// components/<component>/<version>/<relpath>, preserving the tree structure,
// and uploads a rewritten index.html at that prefix's root. Returns the public
// URL of the uploaded index.html.
//
// The tree is mirrored faithfully rather than special-casing an "assets/"
// directory: build tools each pick their own bundle directory name (Vite
// "assets/", CRA "static/", Astro "_astro/", SvelteKit "_app/", Gatsby
// "page-data/", Angular "media/"), so anything less than a full mirror
// silently drops the bundle for most frameworks and publishes a blank preview.
func (u *S3Uploader) PublishComponentFromDist(ctx context.Context, component, version, distDir string) (string, error) {
	// validate dist dir
	info, err := os.Stat(distDir)
	if err != nil {
		return "", fmt.Errorf("dist directory error: %w", err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("dist path is not a directory: %s", distDir)
	}

	// read index.html
	indexPath := filepath.Join(distDir, "index.html")
	indexBytes, err := os.ReadFile(indexPath)
	if err != nil {
		return "", fmt.Errorf("failed to read index.html from dist: %w", err)
	}

	// rewrite index.html so root-absolute references resolve under the
	// components/<component>/<version>/ prefix this bundle is served from
	rewrittenIndex, err := rewriteIndexHTMLPaths(indexBytes)
	if err != nil {
		return "", fmt.Errorf("failed to rewrite index.html: %w", err)
	}

	// Mirror every file in the tree, preserving relative paths. index.html is
	// uploaded separately below from its rewritten bytes.
	err = filepath.WalkDir(distDir, func(p string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(distDir, p)
		if err != nil {
			return err
		}
		if rel == "index.html" {
			return nil
		}
		key := path.Join("components", component, version, filepath.ToSlash(rel))
		ct := detectContentTypeFromExt(p)
		// FPutObject streams file from disk
		if _, err := u.client.FPutObject(ctx, u.bucket, key, p, minio.PutObjectOptions{ContentType: ct}); err != nil {
			return fmt.Errorf("upload failed %s -> %s: %w", p, key, err)
		}
		// best-effort ensure content-type
		_ = u.UpdateObjectContentType(ctx, key, ct)
		return nil
	})
	if err != nil {
		return "", fmt.Errorf("error uploading build output: %w", err)
	}

	// Upload rewritten index.html
	keyIndex := path.Join("components", component, version, "index.html")
	if _, err := u.client.PutObject(ctx, u.bucket, keyIndex, bytes.NewReader(rewrittenIndex), int64(len(rewrittenIndex)), minio.PutObjectOptions{ContentType: "text/html"}); err != nil {
		return "", fmt.Errorf("failed to upload index.html: %w", err)
	}
	_ = u.UpdateObjectContentType(ctx, keyIndex, "text/html")

	return u.publicURL(keyIndex), nil
}

// rewriteIndexHTMLPaths makes an index.html safe to serve from a nested
// prefix. Because PublishComponentFromDist mirrors the build tree verbatim,
// relative references already resolve correctly and are left untouched; the
// only things that break are references anchored to the domain root, since
// the bundle is served from components/<component>/<version>/ rather than "/".
//
// Two rewrites are applied:
//   - root-absolute src/href/srcset values ("/assets/x.js") become relative
//     ("assets/x.js")
//   - a root-absolute <base href="/"> becomes "./" — Angular and friends emit
//     this, and left alone it re-anchors every relative reference on the page
//     back to the domain root, breaking the preview regardless of the above.
//
// External (http://, https://, //host) and non-path references (data:, blob:,
// mailto:, #fragment) are never touched.
func rewriteIndexHTMLPaths(indexBytes []byte) ([]byte, error) {
	doc, err := html.Parse(bytes.NewReader(indexBytes))
	if err != nil {
		return nil, err
	}

	// relativize turns a single root-absolute URL into a relative one,
	// preserving any ?query or #hash suffix. Anything else is returned as-is.
	relativize := func(orig string) string {
		val := strings.TrimSpace(orig)
		// "//host/path" is protocol-relative (external), not root-absolute
		if !strings.HasPrefix(val, "/") || strings.HasPrefix(val, "//") {
			return orig
		}
		return strings.TrimPrefix(val, "/")
	}

	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			isBase := strings.EqualFold(n.Data, "base")
			for i := range n.Attr {
				attr := &n.Attr[i]
				key := strings.ToLower(attr.Key)

				// <base href="/"> -> "./" so relative refs stay within this prefix
				if isBase && key == "href" {
					if v := strings.TrimSpace(attr.Val); strings.HasPrefix(v, "/") && !strings.HasPrefix(v, "//") {
						attr.Val = "./"
					}
					continue
				}

				if key != "src" && key != "href" && key != "srcset" {
					continue
				}

				if key == "srcset" {
					// srcset is comma-separated "url [descriptor]" entries
					parts := strings.Split(attr.Val, ",")
					for j, p := range parts {
						trimmed := strings.TrimSpace(p)
						if trimmed == "" {
							continue
						}
						fields := strings.Fields(trimmed)
						fields[0] = relativize(fields[0])
						parts[j] = strings.Join(fields, " ")
					}
					attr.Val = strings.Join(parts, ", ")
					continue
				}

				attr.Val = relativize(attr.Val)
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	var buf bytes.Buffer
	if err := html.Render(&buf, doc); err != nil {
		return nil, err
	}
	return ensureHTMLDoctype(buf.Bytes()), nil
}

// detectContentTypeFromExt returns a content-type string for known extensions or uses mime.TypeByExtension fallback.
// Returns empty string when unknown (minio will attempt detection).
func detectContentTypeFromExt(pathOrName string) string {
	ext := strings.ToLower(filepath.Ext(pathOrName))
	if ext != "" {
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

		}
	}
	// fallback to system mime (may return empty)
	if ct := mime.TypeByExtension(ext); ct != "" {
		return ct
	}
	return ""
}

// ensureHTMLDoctype ensures the HTML starts with <!DOCTYPE html>
func ensureHTMLDoctype(content []byte) []byte {
	trim := bytes.TrimSpace(content)
	if bytes.HasPrefix(trim, []byte("<!DOCTYPE")) || bytes.HasPrefix(trim, []byte("<!doctype")) {
		return content
	}
	return append([]byte("<!DOCTYPE html>\n"), content...)
}

// Put uploads a byte array to a path with the specified content type (auto-detected if empty).
// Returns the public URL of the uploaded object.
func (u *S3Uploader) Put(ctx context.Context, key string, data []byte, contentType string) (string, error) {
	if contentType == "" {
		contentType = detectContentTypeFromExt(key)
	}
	if contentType == "" && len(data) > 0 {
		contentType = http.DetectContentType(data)
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	if contentType == "text/html" {
		data = ensureHTMLDoctype(data)
	}

	_, err := u.client.PutObject(ctx, u.bucket, key, bytes.NewReader(data), int64(len(data)),
		minio.PutObjectOptions{ContentType: contentType})
	if err != nil {
		return "", fmt.Errorf("put failed: %w", err)
	}

	return u.publicURL(key), nil
}

// PutFile uploads a file to a path with the specified content type (auto-detected if empty).
// Uses efficient FPutObject for streaming from disk.
// Returns the public URL of the uploaded object.
func (u *S3Uploader) PutFile(ctx context.Context, key string, localPath string, contentType string) (string, error) {
	if contentType == "" {
		contentType = detectContentTypeFromExt(localPath)
	}

	if contentType == "text/html" {
		// For HTML files we need to read, modify, and upload
		content, err := os.ReadFile(localPath)
		if err != nil {
			return "", fmt.Errorf("read html file: %w", err)
		}
		content = ensureHTMLDoctype(content)
		_, err = u.client.PutObject(ctx, u.bucket, key, bytes.NewReader(content), int64(len(content)),
			minio.PutObjectOptions{ContentType: contentType})
		if err != nil {
			return "", fmt.Errorf("put html: %w", err)
		}
	} else {
		// Stream from disk for non-HTML files (more efficient)
		_, err := u.client.FPutObject(ctx, u.bucket, key, localPath,
			minio.PutObjectOptions{ContentType: contentType})
		if err != nil {
			return "", fmt.Errorf("fput: %w", err)
		}
	}

	return u.publicURL(key), nil
}

// ListObjects lists all objects with a given prefix in the bucket
func (u *S3Uploader) ListObjects(ctx context.Context, prefix string) ([]string, error) {
	var objects []string
	for obj := range u.client.ListObjects(ctx, u.bucket, minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	}) {
		if obj.Err != nil {
			return nil, obj.Err
		}
		objects = append(objects, obj.Key)
	}
	return objects, nil
}

// UpdateObjectContentType updates the object's system Content-Type using server-side copy (ReplaceMetadata).
// Falls back to streaming to a temp file then FPutObject if CopyObject fails.
func (u *S3Uploader) UpdateObjectContentType(ctx context.Context, key, contentType string) error {
	objInfo, err := u.client.StatObject(ctx, u.bucket, key, minio.StatObjectOptions{})
	if err != nil {
		return fmt.Errorf("stat object failed: %w", err)
	}
	if strings.EqualFold(objInfo.ContentType, contentType) {
		return nil
	}

	// prepare user metadata - do not include system headers
	userMeta := map[string]string{}
	for k, v := range objInfo.UserMetadata {
		lk := strings.ToLower(k)
		if lk == "content-type" || lk == "content-length" {
			continue
		}
		userMeta[k] = v
	}

	dst := minio.CopyDestOptions{
		Bucket:          u.bucket,
		Object:          key,
		ReplaceMetadata: true,
		UserMetadata:    userMeta,
		ContentType:     contentType,
	}
	src := minio.CopySrcOptions{
		Bucket: u.bucket,
		Object: key,
	}

	if _, err := u.client.CopyObject(ctx, dst, src); err == nil {
		return nil
	} else {
		// fallback - stream to temp file then FPutObject
		obj, err := u.client.GetObject(ctx, u.bucket, key, minio.GetObjectOptions{})
		if err != nil {
			return fmt.Errorf("fallback get object failed: %w", err)
		}
		defer obj.Close()
		tmp, err := os.CreateTemp("", "minio-copy-*")
		if err != nil {
			return fmt.Errorf("create temp failed: %w", err)
		}
		tmpPath := tmp.Name()
		defer func() {
			tmp.Close()
			os.Remove(tmpPath)
		}()
		if _, err := io.Copy(tmp, obj); err != nil {
			return fmt.Errorf("failed to copy object to temp: %w", err)
		}
		tmp.Close()
		// FPutObject streams file from disk
		if _, err := u.client.FPutObject(ctx, u.bucket, key, tmpPath, minio.PutObjectOptions{
			ContentType:  contentType,
			UserMetadata: userMeta,
		}); err != nil {
			return fmt.Errorf("fallback fput failed: %w", err)
		}
		return nil
	}
}

// FixMimeTypesForComponent runs after component upload to ensure proper content types for assets.
// Can be called separately or automatically integrated with the build process.
func (u *S3Uploader) FixMimeTypesForComponent(ctx context.Context, component, version string) error {
	prefix := fmt.Sprintf("components/%s/%s/", component, version)

	// Get all objects with prefix
	objects, err := u.ListObjects(ctx, prefix)
	if err != nil {
		return fmt.Errorf("list objects: %w", err)
	}

	for _, key := range objects {
		ext := strings.ToLower(filepath.Ext(key))
		var ct string

		switch ext {
		case ".js", ".mjs":
			ct = "application/javascript"
		case ".css":
			ct = "text/css"
		case ".html":
			ct = "text/html"
		case ".svg":
			ct = "image/svg+xml"
		case ".json":
			ct = "application/json"
		case ".png":
			ct = "image/png"
		case ".jpg", ".jpeg":
			ct = "image/jpeg"
		case ".gif":
			ct = "image/gif"
		case ".woff":
			ct = "font/woff"
		case ".woff2":
			ct = "font/woff2"
		case ".ttf":
			ct = "font/ttf"
		case ".map":
			ct = "application/json"
		}

		// Special handling for hashed filenames like index-ABC123.js
		if ext == "" && strings.Contains(key, "index-") {
			if strings.Contains(strings.ToLower(key), ".js") {
				ct = "application/javascript"
			} else if strings.Contains(strings.ToLower(key), ".css") {
				ct = "text/css"
			}
		}

		if ct != "" {
			// Ignore errors, best-effort fix
			_ = u.UpdateObjectContentType(ctx, key, ct)
		}
	}

	return nil
}

// publicURL builds a clean public URL and avoids doubling the bucket in the path.
// If CDN_BASE_URL is set, bundle URLs are built from that base instead of the
// direct MinIO/S3 origin, so built component bundles get served through
// whatever CDN is configured to pull from that origin.
func (u *S3Uploader) publicURL(key string) string {
	base := u.publicBase
	if cdnBase := os.Getenv("CDN_BASE_URL"); cdnBase != "" {
		base = cdnBase
	}
	cleanKey := strings.TrimLeft(key, "/")

	// ensure scheme for parsing
	if !strings.HasPrefix(base, "http://") && !strings.HasPrefix(base, "https://") {
		base = "http://" + base
	}
	parsed, err := url.Parse(base)
	if err != nil {
		// fallback
		if strings.Contains(base, u.bucket) {
			return strings.TrimRight(base, "/") + "/" + cleanKey
		}
		return strings.TrimRight(base, "/") + "/" + u.bucket + "/" + cleanKey
	}

	// Create normalized path to prevent double slashes and proper path joining
	npath := strings.Trim(parsed.Path, "/")
	resultPath := ""

	if npath == u.bucket || strings.HasPrefix(npath, u.bucket+"/") {
		resultPath = "/" + path.Join(npath, cleanKey)
	} else {
		resultPath = "/" + path.Join(npath, u.bucket, cleanKey)
	}

	// Ensure proper URL formatting with correct scheme and path
	parsed.Path = resultPath

	// Use URL.String() to get the properly formatted URL
	return parsed.String()
}
