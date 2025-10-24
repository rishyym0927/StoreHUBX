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

// PublishComponentFromDist rewrites index.html asset references to local assets/* paths,
// uploads dist/assets/* -> components/<component>/<version>/assets/*,
// uploads root dist files to components/<component>/<version>/,
// uploads rewritten index.html to components/<component>/<version>/index.html
// Returns public URL to the uploaded index.html.
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

	// rewrite index.html (make assets references relative to index)
	rewrittenIndex, changed, err := rewriteIndexHTMLPaths(indexBytes, distDir)
	if err != nil {
		return "", fmt.Errorf("failed to rewrite index.html: %w", err)
	}
	if changed {
		// ensure we have a doctype
		rewrittenIndex = ensureHTMLDoctype(rewrittenIndex)
	}

	// Upload assets recursively if exists
	assetsLocal := filepath.Join(distDir, "assets")
	if stat, err := os.Stat(assetsLocal); err == nil && stat.IsDir() {
		err = filepath.WalkDir(assetsLocal, func(p string, d fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if d.IsDir() {
				return nil
			}
			rel, err := filepath.Rel(assetsLocal, p)
			if err != nil {
				return err
			}
			key := path.Join("components", component, version, "assets", filepath.ToSlash(rel))
			ct := detectContentTypeFromExt(p)
			// FPutObject streams file from disk
			if _, err := u.client.FPutObject(ctx, u.bucket, key, p, minio.PutObjectOptions{ContentType: ct}); err != nil {
				return fmt.Errorf("upload asset failed %s -> %s: %w", p, key, err)
			}
			// best-effort ensure content-type
			_ = u.UpdateObjectContentType(ctx, key, ct)
			return nil
		})
		if err != nil {
			return "", fmt.Errorf("error uploading assets: %w", err)
		}
	}

	// Upload top-level files (root of dist), excluding index.html and assets dir
	err = filepath.WalkDir(distDir, func(p string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			// skip assets dir contents (already handled)
			if filepath.Clean(p) == filepath.Clean(assetsLocal) {
				return filepath.SkipDir
			}
			return nil
		}
		rel, err := filepath.Rel(distDir, p)
		if err != nil {
			return err
		}
		// skip nested things (we only want top-level root files besides assets)
		if strings.Contains(rel, string(os.PathSeparator)) {
			// already handled in assets or deeper; skip
			return nil
		}
		if rel == "index.html" {
			return nil
		}
		key := path.Join("components", component, version, filepath.ToSlash(rel))
		ct := detectContentTypeFromExt(p)
		if _, err := u.client.FPutObject(ctx, u.bucket, key, p, minio.PutObjectOptions{ContentType: ct}); err != nil {
			return fmt.Errorf("upload root file failed %s -> %s: %w", p, key, err)
		}
		_ = u.UpdateObjectContentType(ctx, key, ct)
		return nil
	})
	if err != nil {
		return "", fmt.Errorf("error uploading root files: %w", err)
	}

	// Upload rewritten index.html
	keyIndex := path.Join("components", component, version, "index.html")
	if _, err := u.client.PutObject(ctx, u.bucket, keyIndex, bytes.NewReader(rewrittenIndex), int64(len(rewrittenIndex)), minio.PutObjectOptions{ContentType: "text/html"}); err != nil {
		return "", fmt.Errorf("failed to upload index.html: %w", err)
	}
	_ = u.UpdateObjectContentType(ctx, keyIndex, "text/html")

	return u.publicURL(keyIndex), nil
}

// rewriteIndexHTMLPaths parses HTML and converts asset references so they point to local assets/ or root files present in distDir.
// It returns the rewritten bytes, whether a change occurred, and error.
func rewriteIndexHTMLPaths(indexBytes []byte, distDir string) ([]byte, bool, error) {
	doc, err := html.Parse(bytes.NewReader(indexBytes))
	if err != nil {
		return nil, false, err
	}
	changed := false

	// helper to rewrite a single URL value; keeps suffix (?.. or #..)
	rewriteOne := func(orig string) string {
		val := orig
		// preserve whitespace
		val = strings.TrimSpace(val)
		if val == "" {
			return orig
		}

		// ignore protocol-relative and absolute external URLs except when they contain /assets/
		isExternal := strings.HasPrefix(val, "http://") || strings.HasPrefix(val, "https://") || strings.HasPrefix(val, "//")

		// separate query/hash suffix
		suffix := ""
		if idx := strings.IndexAny(val, "?#"); idx >= 0 {
			suffix = val[idx:]
			val = val[:idx]
		}

		// If external and contains /assets/, try to extract path after /assets/
		if isExternal {
			if strings.Contains(val, "/assets/") {
				parts := strings.SplitN(val, "/assets/", 2)
				if len(parts) == 2 {
					assetPath := parts[1]
					localPath := filepath.Join(distDir, "assets", filepath.FromSlash(assetPath))
					if _, err := os.Stat(localPath); err == nil {
						return path.Join("assets", filepath.ToSlash(assetPath)) + suffix
					}
				}
			}
			// otherwise do not rewrite external URLs
			return orig
		}

		// remove leading slash so "/assets/foo" -> "assets/foo"
		clean := strings.TrimPrefix(val, "/")

		// Try: assets subpath (preserve subfolders)
		if idx := strings.Index(clean, "assets/"); idx >= 0 {
			rel := strings.TrimPrefix(clean[idx+len("assets/"):], "/")
			localPath := filepath.Join(distDir, "assets", filepath.FromSlash(rel))
			if _, err := os.Stat(localPath); err == nil {
				return path.Join("assets", filepath.ToSlash(rel)) + suffix
			}
			// if the file doesn't exist with that subpath, fallthrough to other tries
		}

		// Build candidate try paths (assets/<path>, assets/<basename>, root/<path>)
		tryPaths := []string{}
		if strings.Contains(clean, "/") {
			tryPaths = append(tryPaths, filepath.Join(distDir, "assets", filepath.FromSlash(clean)))
		}
		tryPaths = append(tryPaths, filepath.Join(distDir, "assets", filepath.Base(clean)))
		tryPaths = append(tryPaths, filepath.Join(distDir, filepath.FromSlash(clean)))

		for _, tp := range tryPaths {
			if _, err := os.Stat(tp); err == nil {
				if strings.HasPrefix(tp, filepath.Join(distDir, "assets")) {
					relp, _ := filepath.Rel(filepath.Join(distDir, "assets"), tp)
					return path.Join("assets", filepath.ToSlash(relp)) + suffix
				}
				// root file
				relp := filepath.Base(tp)
				return relp + suffix
			}
		}

		// If nothing matched, but original started with "/assets/" or "assets/" try basename
		if strings.HasPrefix(val, "/assets/") || strings.HasPrefix(val, "assets/") {
			base := filepath.Base(val)
			if _, err := os.Stat(filepath.Join(distDir, "assets", base)); err == nil {
				return path.Join("assets", filepath.ToSlash(base)) + suffix
			}
		}

		// no change
		return orig
	}

	// walker that also rewrites srcset attributes
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			for i := range n.Attr {
				attr := &n.Attr[i]
				key := strings.ToLower(attr.Key)
				if key != "src" && key != "href" && key != "srcset" {
					continue
				}
				orig := attr.Val
				if key == "srcset" {
					// srcset contains multiple comma-separated items: "url1 1x, url2 2x"
					parts := strings.Split(attr.Val, ",")
					changedAny := false
					for j, p := range parts {
						p = strings.TrimSpace(p)
						if p == "" {
							continue
						}
						// each part can be "url" or "url descriptor"
						subparts := strings.Fields(p)
						urlPart := subparts[0]
						newURL := rewriteOne(urlPart)
						if newURL != urlPart {
							subparts[0] = newURL
							parts[j] = strings.Join(subparts, " ")
							changedAny = true
						}
					}
					if changedAny {
						newVal := strings.Join(parts, ", ")
						if newVal != attr.Val {
							attr.Val = newVal
							changed = true
						}
					}
					continue
				}

				newVal := rewriteOne(attr.Val)
				if newVal != orig {
					attr.Val = newVal
					changed = true
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	if !changed {
		return indexBytes, false, nil
	}
	var buf bytes.Buffer
	if err := html.Render(&buf, doc); err != nil {
		return nil, false, err
	}
	return ensureHTMLDoctype(buf.Bytes()), true, nil
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
func (u *S3Uploader) publicURL(key string) string {
	base := u.publicBase
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
