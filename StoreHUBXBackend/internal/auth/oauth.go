package auth

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/utils"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// Redirect user to GitHub OAuth with required scopes
func GitHubLogin(c *fiber.Ctx) error {
	clientID := os.Getenv("GITHUB_CLIENT_ID")
	if clientID == "" {
		return utils.Error(c, 500, "missing GitHub client ID")
	}

	scopes := []string{"user:email", "read:user", "repo", "read:org"}
	// join scopes with URL-encoded separator
	url := fmt.Sprintf("https://github.com/login/oauth/authorize?client_id=%s&scope=%s",
		clientID, strings.Join(scopes, "%20"))
	return c.Redirect(url)
}

// GitHub callback: exchange code → token → user → save → JWT
// GitHub callback: exchange code → token → user → save → JWT
func GitHubCallback(c *fiber.Ctx) error {
	code := c.Query("code")
	if code == "" {
		return utils.Error(c, 400, "missing code parameter")
	}

	if db.Client == nil {
		return utils.Error(c, 500, "database not initialized")
	}
	if os.Getenv("TOKEN_ENC_KEY") == "" {
		return utils.Error(c, 500, "encryption key not configured")
	}

	clientID := os.Getenv("GITHUB_CLIENT_ID")
	clientSecret := os.Getenv("GITHUB_CLIENT_SECRET")
	if clientID == "" || clientSecret == "" {
		return utils.Error(c, 500, "GitHub client credentials not configured")
	}

	// --- 1) Exchange code -> token (form-encoded) ---
	form := url.Values{}
	form.Set("client_id", clientID)
	form.Set("client_secret", clientSecret)
	form.Set("code", code)

	req, err := http.NewRequest("POST", "https://github.com/login/oauth/access_token", strings.NewReader(form.Encode()))
	if err != nil {
		return utils.Error(c, 500, "failed to create token request: "+err.Error())
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return utils.Error(c, 500, "GitHub token exchange failed: "+err.Error())
	}
	defer resp.Body.Close()

	var tokenResp map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return utils.Error(c, 500, "failed to decode token response: "+err.Error())
	}
	if resp.StatusCode != http.StatusOK {
		if desc, ok := tokenResp["error_description"].(string); ok && desc != "" {
			return utils.Error(c, 400, "GitHub token exchange error: "+desc)
		}
		if errMsg, ok := tokenResp["error"].(string); ok && errMsg != "" {
			return utils.Error(c, 400, "GitHub token exchange error: "+errMsg)
		}
		return utils.Error(c, 400, fmt.Sprintf("GitHub token exchange failed (%d)", resp.StatusCode))
	}

	var token string
	if at, ok := tokenResp["access_token"].(string); ok && at != "" {
		token = at
	}
	if token == "" {
		return utils.Error(c, 400, "invalid access token response")
	}

	// --- 2) Fetch user ---
	client := &http.Client{}
	reqUser, _ := http.NewRequest("GET", "https://api.github.com/user", nil)
	reqUser.Header.Set("Authorization", "Bearer "+token)
	reqUser.Header.Set("Accept", "application/vnd.github+json")
	resUser, err := client.Do(reqUser)
	if err != nil {
		return utils.Error(c, 500, "failed to fetch GitHub user: "+err.Error())
	}
	defer resUser.Body.Close()
	if resUser.StatusCode != http.StatusOK {
		var errBody map[string]any
		_ = json.NewDecoder(resUser.Body).Decode(&errBody)
		return utils.Error(c, 401, "GitHub returned non-200 for /user")
	}
	var ghUser map[string]interface{}
	if err := json.NewDecoder(resUser.Body).Decode(&ghUser); err != nil {
		return utils.Error(c, 500, "failed to decode GitHub user response: "+err.Error())
	}

	// --- 3) Fetch emails (optional) ---
	reqEmail, _ := http.NewRequest("GET", "https://api.github.com/user/emails", nil)
	reqEmail.Header.Set("Authorization", "Bearer "+token)
	reqEmail.Header.Set("Accept", "application/vnd.github+json")
	resEmail, err := client.Do(reqEmail)
	if err != nil {
		return utils.Error(c, 500, "failed to fetch GitHub emails: "+err.Error())
	}
	defer resEmail.Body.Close()

	var emails []map[string]interface{}
	if resEmail.StatusCode == http.StatusOK {
		_ = json.NewDecoder(resEmail.Body).Decode(&emails)
	}

	// --- 4) Normalize fields + fallbacks ---
	email := ""
	for _, e := range emails {
		if primary, ok := e["primary"].(bool); ok && primary {
			if val, ok := e["email"].(string); ok && val != "" {
				email = val
				break
			}
		}
	}
	// derive providerID once and reuse everywhere
	providerID := providerIDFrom(ghUser) // e.g. "136720020"
	if email == "" {
		if providerID != "" {
			email = providerID + "@users.noreply.github.com"
		} else {
			email = "unknown@users.noreply.github.com"
		}
	}
	name, _ := ghUser["name"].(string)
	login, _ := ghUser["login"].(string)
	avatar, _ := ghUser["avatar_url"].(string)
	if name == "" {
		name = login
	}

	// --- 5) Encrypt token ---
	encToken := utils.Encrypt(token)
	if encToken == "" {
		return utils.Error(c, 500, "failed to encrypt token")
	}

	// --- 6) Upsert user (use the SAME providerID everywhere) ---
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	col := db.Client.Database("storehub").Collection("users")

	update := bson.M{
		"$set": bson.M{
			"name":        name,
			"email":       email,
			"username":    login,
			"avatarUrl":   avatar,
			"provider":    "github",
			"providerId":  providerID, // ✅ normalized value
			"accessToken": encToken,
			"updatedAt":   time.Now(),
		},
		"$setOnInsert": bson.M{"createdAt": time.Now()},
	}
	opts := options.Update().SetUpsert(true)
	if _, err := col.UpdateOne(ctx, bson.M{"providerId": providerID}, update, opts); err != nil {
		return utils.Error(c, 500, "database upsert failed: "+err.Error())
	}

	// --- 7) JWT: user_id = providerId, email = email ---
	jwtToken, err := GenerateJWT(providerID, email)
	if err != nil {
		return utils.Error(c, 500, "failed to generate JWT: "+err.Error())
	}

	// return c.JSON(fiber.Map{
	// 	"status": "success",
	// 	"token":  jwtToken,
	// 	"user": fiber.Map{
	// 		"name":       name,
	// 		"email":      email,
	// 		"username":   login,
	// 		"avatar_url": avatar,
	// 	},
	// })

	// Get frontend URL from environment variable, defaulting to localhost:3000 for development
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}

	// Create a user data object to pass along with the token
	userData, err := json.Marshal(map[string]interface{}{
		"name":      name,
		"email":     email,
		"username":  login,
		"avatarUrl": avatar,
		
	})
	if err != nil {
		return utils.Error(c, 500, "failed to marshal user data: "+err.Error())
	}

	// Base64 encode the user data (for atob() in frontend)
	encodedUserData := base64.StdEncoding.EncodeToString(userData)

	// Redirect to the Next.js auth-callback route with both token and user data
	// Using /auth-callback to match the Next.js component path
	return c.Redirect(fmt.Sprintf("%s/auth/callback?token=%s&user=%s", frontendURL, jwtToken, encodedUserData))
}

func providerIDFrom(gh map[string]interface{}) string {
	switch v := gh["id"].(type) {
	case float64:
		return strconv.FormatInt(int64(v), 10)
	case json.Number:
		i, _ := v.Int64()
		return strconv.FormatInt(i, 10)
	case string:
		return v
	default:
		return ""
	}
}
