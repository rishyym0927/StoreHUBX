package storage

import "context"

type Uploader interface {
	Put(ctx context.Context, key string, data []byte, contentType string) (string, error)
	PutFile(ctx context.Context, key string, localPath string, contentType string) (string, error)
	PublishComponentFromDist(ctx context.Context, component, version, distDir string) (string, error)
}
