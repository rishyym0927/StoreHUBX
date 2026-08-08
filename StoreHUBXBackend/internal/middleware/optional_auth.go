package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/rishyym0927/storehubx/internal/config"
)

// OptionalAuth parses a bearer JWT if present and attaches its claims to
// c.Locals("user_id")/c.Locals("email"), but never rejects the request -
// used on public routes (e.g. GET /components) that still need to know the
// caller's identity to show them their own private components.
func OptionalAuth(c *fiber.Ctx) error {
	authHeader := c.Get("Authorization")
	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
	if tokenStr == "" || tokenStr == authHeader {
		return c.Next()
	}

	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		return []byte(config.AppConfig.JWTSecret), nil
	})
	if err != nil || !token.Valid {
		return c.Next()
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok {
		userID, _ := claims["user_id"].(string)
		email, _ := claims["email"].(string)
		c.Locals("user_id", userID)
		c.Locals("email", email)
	}

	return c.Next()
}
