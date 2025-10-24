package worker

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/models"
	"github.com/rishyym0927/storehubx/internal/utils"
	"go.mongodb.org/mongo-driver/bson"
)

func fetchUserDecryptedToken(ctx context.Context, ownerID string) (string, error) {
	// ownerID == ProviderID (from JWT/user_id)
	var user models.User
	if err := db.Client.Database(os.Getenv("MONGO_DB")).
		Collection("users").
		FindOne(ctx, bson.M{"providerId": ownerID}).Decode(&user); err != nil {
		return "", fmt.Errorf("user not found for ownerID %s: %w", ownerID, err)
	}
	if user.AccessToken == "" {
		return "", fmt.Errorf("no access token stored for user %s", ownerID)
	}
	token := utils.Decrypt(user.AccessToken)
	if token == "" {
		return "", fmt.Errorf("failed to decrypt access token")
	}
	return token, nil
}

func downloadRepoZip(ctx context.Context, destDir, owner, repo, ref, ownerID string) (string, error) {
	zipURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/zipball/%s", owner, repo, ref)

	req, _ := http.NewRequestWithContext(ctx, "GET", zipURL, nil)
	req.Header.Set("Accept", "application/vnd.github+json")

	// try with user token (supports private repos)
	if ownerID != "" {
		if tok, err := fetchUserDecryptedToken(ctx, ownerID); err == nil && tok != "" {
			req.Header.Set("Authorization", "Bearer "+tok)
		}
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("zip download failed: %s | %s", resp.Status, string(b))
	}

	os.MkdirAll(destDir, 0o755)
	localZip := filepath.Join(destDir, "repo.zip")
	out, err := os.Create(localZip)
	if err != nil {
		return "", err
	}
	defer out.Close()
	if _, err := io.Copy(out, resp.Body); err != nil {
		return "", err
	}
	return localZip, nil
}
