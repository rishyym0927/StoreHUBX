package githubapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"

	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/utils"
	"go.mongodb.org/mongo-driver/bson"
)

// Helper: fetch decrypted GitHub token for the current user
func getUserGitHubToken(c *fiber.Ctx) (string, error) {
	providerID, _ := c.Locals("user_id").(string)
	fmt.Printf("DEBUG GitHub handler: Looking up user with providerId: %s\n", providerID)

	if providerID == "" {
		return "", fmt.Errorf("missing user_id in context")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	col := db.Client.Database("storehub").Collection("users")
	var u struct {
		AccessToken string `bson:"accessToken"`
	}

	// Add debugging to see if user exists
	count, _ := col.CountDocuments(ctx, bson.M{"providerId": providerID})
	fmt.Printf("DEBUG: Found %d users with providerId: %s\n", count, providerID)

	if err := col.FindOne(ctx, bson.M{"providerId": providerID}).Decode(&u); err != nil {
		fmt.Printf("DEBUG: Error finding user: %v\n", err)
		return "", fmt.Errorf("user not found or no token stored")
	}

	token := utils.Decrypt(u.AccessToken)
	if token == "" {
		return "", fmt.Errorf("failed to decrypt token")
	}
	return token, nil
}

// GET /api/github/repos
// Query params (optional): page, per_page, visibility, affiliation (comma-separated)
// Pass-through from GitHub: https://docs.github.com/rest/repos/repos#list-repositories-for-the-authenticated-user
func ListUserRepos(c *fiber.Ctx) error {
	token, err := getUserGitHubToken(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": err.Error()})
	}

	// Default params
	page := c.Query("page", "1")
	perPage := c.Query("per_page", "30")
	visibility := c.Query("visibility", "")   // all/public/private
	affiliation := c.Query("affiliation", "") // owner,collaborator,organization_member

	v := url.Values{}
	v.Set("page", page)
	v.Set("per_page", perPage)
	if visibility != "" {
		v.Set("visibility", visibility)
	}
	if affiliation != "" {
		// GitHub expects CSV
		v.Set("affiliation", strings.ReplaceAll(affiliation, " ", ""))
	}

	endpoint := "https://api.github.com/user/repos?" + v.Encode()

	req, _ := http.NewRequest("GET", endpoint, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "GitHub request failed: " + err.Error()})
	}
	defer res.Body.Close()

	// Surface GitHub failures
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		var errBody map[string]any
		_ = json.NewDecoder(res.Body).Decode(&errBody)
		return c.Status(res.StatusCode).JSON(fiber.Map{
			"error":   "GitHub error",
			"details": errBody,
		})
	}

	var repos any
	if err := json.NewDecoder(res.Body).Decode(&repos); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "decode error"})
	}

	return c.JSON(fiber.Map{"success": true, "data": repos})
}

// GET /api/github/contents
// Required: owner, repo
// Optional: path (default ""), ref (branch/tag/sha)
// Wraps: https://docs.github.com/rest/repos/contents#get-repository-content
func GetRepoContents(c *fiber.Ctx) error {
	token, err := getUserGitHubToken(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": err.Error()})
	}

	owner := c.Query("owner")
	repo := c.Query("repo")
	path := c.Query("path") // may be "" to list repo root
	ref := c.Query("ref")   // e.g. "main" or tag

	if owner == "" || repo == "" {
		return c.Status(400).JSON(fiber.Map{"error": "owner and repo are required"})
	}

	u := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents", url.PathEscape(owner), url.PathEscape(repo))
	if path != "" {
		// Note: GitHub treats path components literally, keep safe
		u = u + "/" + strings.TrimPrefix(path, "/")
	}
	if ref != "" {
		u = u + "?ref=" + url.QueryEscape(ref)
	}

	req, _ := http.NewRequest("GET", u, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "GitHub request failed: " + err.Error()})
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		var errBody map[string]any
		_ = json.NewDecoder(res.Body).Decode(&errBody)
		return c.Status(res.StatusCode).JSON(fiber.Map{
			"error":   "GitHub error",
			"details": errBody,
		})
	}

	var payload any
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "decode error"})
	}

	return c.JSON(fiber.Map{"success": true, "data": payload})
}


// GET /api/github/branches
// Required: owner, repo, branch
// Wraps: https://docs.github.com/en/rest/branches/branches?apiVersion=2022-11-28#get-a-branch
func GetBranch(c *fiber.Ctx) error {
    token, err := getUserGitHubToken(c)
    if err != nil {
        return c.Status(401).JSON(fiber.Map{"error": err.Error()})
    }

    owner := c.Query("owner")
    repo := c.Query("repo")
    branch := c.Query("branch", "main") // Default to main if not specified

    if owner == "" || repo == "" {
        return c.Status(400).JSON(fiber.Map{"error": "owner and repo are required"})
    }

    endpoint := fmt.Sprintf("https://api.github.com/repos/%s/%s/branches/%s", 
        url.PathEscape(owner), 
        url.PathEscape(repo),
        url.PathEscape(branch))

    req, _ := http.NewRequest("GET", endpoint, nil)
    req.Header.Set("Authorization", "Bearer "+token)
    req.Header.Set("Accept", "application/vnd.github+json")
    req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

    res, err := http.DefaultClient.Do(req)
    if err != nil {
        return c.Status(502).JSON(fiber.Map{"error": "GitHub request failed: " + err.Error()})
    }
    defer res.Body.Close()

    if res.StatusCode < 200 || res.StatusCode >= 300 {
        var errBody map[string]any
        _ = json.NewDecoder(res.Body).Decode(&errBody)
        return c.Status(res.StatusCode).JSON(fiber.Map{
            "error":   "GitHub error",
            "details": errBody,
        })
    }

    var payload any
    if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
        return c.Status(500).JSON(fiber.Map{"error": "decode error"})
    }

    return c.JSON(fiber.Map{"success": true, "data": payload})
}