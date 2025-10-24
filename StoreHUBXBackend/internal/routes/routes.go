package routes

import (
	"github.com/gofiber/fiber/v2"

	"github.com/rishyym0927/storehubx/internal/auth"
	"github.com/rishyym0927/storehubx/internal/handlers"
	"github.com/rishyym0927/storehubx/internal/middleware"

	// NOTE: ensure your handlers file is in: internal/github/handlers.go
	// and its package is: package githubapi
	githubapi "github.com/rishyym0927/storehubx/internal/github"
)

func RegisterRoutes(app *fiber.App) {
	// ---------- Public ----------
	// Auth
	app.Get("/auth/github/login", auth.GitHubLogin)
	app.Get("/auth/github/callback", auth.GitHubCallback)

	// Health
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// Components (public reads)
	app.Get("/components", handlers.GetAllComponents)
	app.Get("/components/:slug", handlers.GetComponent)
	app.Get("/components/:slug/versions", handlers.GetComponentVersions)

	// Preview (public access)
	app.Get("/preview/:slug/:version", handlers.RedirectPreview)

	// ---------- Protected (JWT) ----------
	// Use the middleware function itself, not a type
	api := app.Group("/api", middleware.JWTProtected)

	// Components (writes)
	api.Post("/components", handlers.CreateComponent)
	api.Post("/components/:slug/versions", handlers.AddVersion)

	// Link a component to a GitHub repo/folder (Phase 4.3)
	api.Post("/components/:slug/link", handlers.LinkComponentRepo)

	//phase 4.4
	api.Post("/components/:slug/versions/:version/build", handlers.EnqueueBuild)
	api.Get("/builds/:id", handlers.GetBuild)
	api.Get("/components/:slug/versions/:version/builds", handlers.ListBuildsForVersion)

	// Authenticated profile
	api.Get("/me", handlers.GetProfile)
	// Get user profile by ID (for public viewing)
	app.Get("/users/:id", handlers.GetProfileById)

	// GitHub browsing (Phase 4.2)
	gh := api.Group("/github")
	gh.Get("/repos", githubapi.ListUserRepos)
	gh.Get("/contents", githubapi.GetRepoContents)
	gh.Get("/branches", githubapi.GetBranch)
}
