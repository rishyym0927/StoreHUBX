package middleware

import (
	"time"

	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2"
)

func RateLimiter() fiber.Handler {
	return limiter.New(limiter.Config{
		Max:        100,               // Max 100 requests
		Expiration: 1 * time.Minute,  // Per minute
		LimiterMiddleware: limiter.SlidingWindow{},
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(429).JSON(fiber.Map{
				"success": false,
				"error":   "too many requests, please slow down",
			})
		},
	})
}
