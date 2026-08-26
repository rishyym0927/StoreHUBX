package auth

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/rishyym0927/storehubx/internal/config"
)

func GenerateJWT(userID, email string) (string, error) {
	claims := jwt.MapClaims{
		"user_id": userID,
		"email":   email,
		"exp":     time.Now().Add(time.Hour * 72).Unix(),
		"iat":     time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(config.AppConfig.JWTSecret))
}

func VerifyJWT(tokenString string) (*jwt.Token, error) {
	return jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return []byte(config.AppConfig.JWTSecret), nil
	})
}

// GeneratePreviewToken mints a short-lived (2 minute) token scoped to a single
// component version's preview, for embedding as a ?token= query param on
// GET /preview/:slug/:version — an iframe src can't carry an Authorization
// header, so this lets an owner/collaborator prove identity for a PRIVATE
// component's preview without exposing the long-lived 72h main JWT in a URL
// (query params leak into server logs, browser history, Referer headers).
func GeneratePreviewToken(userID, slug, version string) (string, error) {
	claims := jwt.MapClaims{
		"user_id": userID,
		"purpose": "preview",
		"slug":    slug,
		"version": version,
		"exp":     time.Now().Add(2 * time.Minute).Unix(),
		"iat":     time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(config.AppConfig.JWTSecret))
}

// VerifyPreviewToken parses and validates a preview token, checking the
// signature, expiry (jwt.Parse validates the "exp" registered claim by
// default when present), purpose, and that the token's slug/version claims
// match the ones being requested. It never panics or returns an error to the
// caller — any failure just reports ok == false so RedirectPreview can
// degrade to its existing header-based (or anonymous) behavior.
func VerifyPreviewToken(tokenString, slug, version string) (userID string, ok bool) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return []byte(config.AppConfig.JWTSecret), nil
	})
	if err != nil || !token.Valid {
		return "", false
	}

	claims, valid := token.Claims.(jwt.MapClaims)
	if !valid {
		return "", false
	}

	if purpose, _ := claims["purpose"].(string); purpose != "preview" {
		return "", false
	}
	if claimSlug, _ := claims["slug"].(string); claimSlug != slug {
		return "", false
	}
	if claimVersion, _ := claims["version"].(string); claimVersion != version {
		return "", false
	}

	uid, _ := claims["user_id"].(string)
	if uid == "" {
		return "", false
	}

	return uid, true
}
