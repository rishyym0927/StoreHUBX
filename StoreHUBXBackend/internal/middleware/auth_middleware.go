package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/rishyym0927/storehubx/internal/config"
)

// parseBearerClaims extracts user_id/email from a "Bearer <jwt>" Authorization
// header. ok is false if the header is missing, malformed, or the token is invalid.
func parseBearerClaims(authHeader string) (userID, email string, ok bool) {
	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
	if tokenStr == "" || tokenStr == authHeader {
		return "", "", false
	}

	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		return []byte(config.AppConfig.JWTSecret), nil
	})
	if err != nil || !token.Valid {
		return "", "", false
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", "", false
	}
	userID, _ = claims["user_id"].(string)
	email, _ = claims["email"].(string)
	return userID, email, true
}

// JWTProtected requires a valid bearer JWT, rejecting the request if it's missing/invalid.
func JWTProtected(c *fiber.Ctx) error {
	userID, email, ok := parseBearerClaims(c.Get("Authorization"))
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing or invalid token"})
	}
	c.Locals("user_id", userID)
	c.Locals("email", email)
	return c.Next()
}
