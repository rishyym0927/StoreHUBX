package middleware

import (
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/rishyym0927/storehubx/internal/config"
) // JWTProtected verifies JWT and attaches claims to context
func JWTProtected(c *fiber.Ctx) error {
	authHeader := c.Get("Authorization")
	if authHeader == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing Authorization header"})
	}

	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
	if tokenStr == authHeader {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid token format"})
	}

	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		return []byte(config.AppConfig.JWTSecret), nil
	})
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "JWT Error: " + err.Error()})
	}
	if !token.Valid {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Token is invalid"})
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok {
		// Debug log the claims
		fmt.Printf("DEBUG JWT Claims: %+v\n", claims)

		userID, _ := claims["user_id"].(string)
		email, _ := claims["email"].(string)

		// More debug info
		fmt.Printf("DEBUG extracted user_id: %s\n", userID)
		fmt.Printf("DEBUG extracted email: %s\n", email)

		c.Locals("user_id", userID)
		c.Locals("email", email)
	} else {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Malformed token"})
	}

	return c.Next()
}

//Middleware verifies JWT, extracts claims, and attaches them to c.Locals() for downstream handlers.
