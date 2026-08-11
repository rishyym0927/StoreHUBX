package handlers

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/models"
	"github.com/rishyym0927/storehubx/internal/utils"
	"go.mongodb.org/mongo-driver/bson"
)

type githubPushPayload struct {
	Ref        string `json:"ref"`
	After      string `json:"after"`
	Repository struct {
		FullName string `json:"full_name"`
	} `json:"repository"`
}

func verifyGitHubSignature(secret, signatureHeader string, body []byte) bool {
	if secret == "" || signatureHeader == "" {
		return false
	}
	const prefix = "sha256="
	if !strings.HasPrefix(signatureHeader, prefix) {
		return false
	}
	expectedHex := strings.TrimPrefix(signatureHeader, prefix)
	expected, err := hex.DecodeString(expectedHex)
	if err != nil {
		return false
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	computed := mac.Sum(nil)

	return hmac.Equal(computed, expected)
}

// POST /webhooks/github/:slug (public - authenticated via HMAC signature)
func HandleGitHubWebhook(c *fiber.Ctx) error {
	slug := c.Params("slug")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	comp, err := findComponentBySlug(ctx, slug)
	if err != nil {
		return utils.Error(c, 404, "component not found")
	}

	if comp.RepoLink.WebhookSecret == "" {
		return utils.Error(c, 400, "no webhook configured for this component")
	}

	body := c.Body()
	signature := c.Get("X-Hub-Signature-256")
	if !verifyGitHubSignature(comp.RepoLink.WebhookSecret, signature, body) {
		return utils.Error(c, 401, "invalid webhook signature")
	}

	event := c.Get("X-GitHub-Event")
	if event == "ping" {
		return utils.Success(c, fiber.Map{"message": "pong"})
	}
	if event != "push" {
		return utils.Success(c, fiber.Map{"message": "event ignored"})
	}

	var payload githubPushPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		return utils.Error(c, 400, "invalid webhook payload")
	}
	if payload.After == "" {
		return utils.Error(c, 400, "missing commit sha")
	}

	// Only deploy pushes to the linked ref (if one is pinned).
	pushedBranch := strings.TrimPrefix(payload.Ref, "refs/heads/")
	if comp.RepoLink.Ref != "" && pushedBranch != comp.RepoLink.Ref {
		return utils.Success(c, fiber.Map{"message": "push to non-tracked branch ignored"})
	}

	changelog := "Auto-deployed via GitHub webhook"
	newVersion, jobID, deployErr := createVersionAndBuild(ctx, &comp, payload.After, "", changelog, comp.OwnerID)
	if deployErr != nil {
		// A 409 (version already exists for this commit) is a benign no-op
		// for webhooks - GitHub may redeliver the same push.
		if deployErr.statusCode == 409 {
			return utils.Success(c, fiber.Map{"message": "commit already deployed"})
		}
		return utils.Error(c, deployErr.statusCode, deployErr.message)
	}

	return utils.Success(c, fiber.Map{
		"version": newVersion,
		"jobId":   jobID.Hex(),
		"message": "deploy triggered from webhook",
	})
}

// GET /api/components/:slug/webhook (protected, owner-only)
// Returns the webhook URL + secret so the owner can configure it on GitHub.
func GetWebhookConfig(c *fiber.Ctx) error {
	slug := c.Params("slug")
	uid, ok := c.Locals("user_id").(string)
	if !ok || uid == "" {
		return utils.Error(c, 401, "unauthorized")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	compCol := db.DB().Collection("components")
	var comp models.Component
	if err := compCol.FindOne(ctx, bson.M{"slug": slug, "ownerId": uid}).Decode(&comp); err != nil {
		return utils.Error(c, 404, "component not found or unauthorized")
	}

	if comp.RepoLink.WebhookSecret == "" {
		return utils.Error(c, 400, "component must be linked to a repository first")
	}

	baseURL := strings.TrimSuffix(c.BaseURL(), "/")
	return utils.Success(c, fiber.Map{
		"webhookUrl":    baseURL + "/webhooks/github/" + slug,
		"webhookSecret": comp.RepoLink.WebhookSecret,
	})
}
