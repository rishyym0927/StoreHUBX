package middleware

import "github.com/gofiber/fiber/v2"

// OptionalAuth parses a bearer JWT if present and attaches its claims to
// c.Locals("user_id")/c.Locals("email"), but never rejects the request -
// used on public routes that still need to know the caller's identity (e.g.
// to show them their own private components).
func OptionalAuth(c *fiber.Ctx) error {
	if userID, email, ok := parseBearerClaims(c.Get("Authorization")); ok {
		c.Locals("user_id", userID)
		c.Locals("email", email)
	}
	return c.Next()
}
