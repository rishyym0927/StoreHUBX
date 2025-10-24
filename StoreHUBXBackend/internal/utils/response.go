package utils

import "github.com/gofiber/fiber/v2"

func Success(c *fiber.Ctx, data interface{}) error {
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"success": true,
		"data":    data,
	})
}

func Error(c *fiber.Ctx, code int, msg string) error {
	return c.Status(code).JSON(fiber.Map{
		"success": false,
		"error":   msg,
	})
}
