// @title StoreHUB API
// @version 1.0
// @description API documentation for StoreHUB backend.
// @host localhost:8080
// @BasePath /
// @schemes http

package main

import (
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/rishyym0927/storehubx/internal/cache"
	"github.com/rishyym0927/storehubx/internal/config"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/middleware"
	"github.com/rishyym0927/storehubx/internal/routes"
	"github.com/joho/godotenv"
	_ "github.com/rishyym0927/storehubx/docs" // Swagger generated docs
	"github.com/gofiber/swagger"
)

func main() {
	_ = godotenv.Load()
	config.LoadConfig()
	db.Init(config.AppConfig.MongoURI)
	db.EnsureIndexes(db.Client)
	defer db.Disconnect()
	cache.Init()

	app := fiber.New()

	// 🔹 Global middlewares
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Authorization",
	}))
	app.Use(recover.New())
	app.Use(middleware.Logger())
	app.Use(middleware.RateLimiter())
	app.Get("/docs/*", swagger.HandlerDefault) // Visit http://localhost:8080/docs/index.html


	// 🔹 Register routes
	routes.RegisterRoutes(app)

	log.Println("🚀 StoreHUB running on port", config.AppConfig.Port)
	log.Fatal(app.Listen(":" + config.AppConfig.Port))
}
