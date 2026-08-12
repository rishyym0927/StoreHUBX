package routes

import (
	"github.com/gofiber/fiber/v2"

	"github.com/rishyym0927/storehubx/internal/auth"
	"github.com/rishyym0927/storehubx/internal/handlers"
	"github.com/rishyym0927/storehubx/internal/middleware"

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
	// OptionalAuth so an owner/collaborator can view their own private component
	app.Get("/components/:slug", middleware.OptionalAuth, handlers.GetComponent)
	app.Get("/components/:slug/versions", handlers.GetComponentVersions)
	app.Get("/components/:slug/comments", handlers.GetComments)
	app.Get("/components/:slug/ratings", handlers.ListRatings)

	// Builds (public reads)
	app.Get("/builds/:id", handlers.GetBuild)
	app.Get("/components/:slug/versions/:version/builds", handlers.ListBuildsForVersion)

	// Preview (public access)
	app.Get("/preview/:slug/:version", handlers.RedirectPreview)

	// GitHub push webhook (public - authenticated via HMAC signature, Phase 4.12)
	app.Post("/webhooks/github/:slug", handlers.HandleGitHubWebhook)

	// GitHub data enrichment (Phase 7) — public repo read endpoints, cached,
	// no viewer token needed since the underlying data is public. Public (not
	// under /api) so anonymous Browse/detail-page visitors get real repo
	// stats/languages/commits/contributors/README, not just logged-in owners.
	app.Get("/github/repo-info", githubapi.GetRepoInfo)
	app.Get("/github/languages", githubapi.GetLanguages)
	app.Get("/github/latest-commit", githubapi.GetLatestCommit)
	app.Get("/github/contributors", githubapi.GetContributors)
	app.Get("/github/readme", githubapi.GetReadme)

	// ---------- Protected (JWT) ----------
	// Use the middleware function itself, not a type
	api := app.Group("/api", middleware.JWTProtected)

	// Components (writes)
	api.Post("/components", handlers.CreateComponent)
	api.Delete("/components/:slug", handlers.DeleteComponent)
	api.Post("/components/:slug/versions", handlers.AddVersion)

	// Social
	api.Post("/components/:slug/like", handlers.ToggleLikeComponent)
	api.Post("/components/:slug/comments", handlers.AddComment)
	api.Delete("/components/:slug/comments/:commentId", handlers.DeleteComment)
	api.Post("/components/:slug/ratings", handlers.UpsertRating)
	api.Delete("/components/:slug/ratings", handlers.DeleteRating)

	// Link a component to a GitHub repo/folder (Phase 4.3)
	api.Post("/components/:slug/link", handlers.LinkComponentRepo)

	// Auto-deploy new commit (Phase 4.5)
	api.Post("/components/:slug/deploy", handlers.AutoDeploy)

	// Webhook config (Phase 4.12)
	api.Get("/components/:slug/webhook", handlers.GetWebhookConfig)

	// Visibility / team access (Phase 4.14)
	api.Patch("/components/:slug/visibility", handlers.UpdateVisibility)
	api.Post("/components/:slug/collaborators", handlers.AddCollaborator)
	api.Delete("/components/:slug/collaborators/:userId", handlers.RemoveCollaborator)

	//phase 4.4
	api.Post("/components/:slug/versions/:version/build", handlers.EnqueueBuild)

	// Authenticated profile
	api.Get("/me", handlers.GetProfile)
	api.Get("/me/analytics", handlers.GetOwnerAnalytics)
	// Get user profile by ID (for public viewing; OptionalAuth to reveal the
	// viewer's own private/collaborator components on that profile)
	app.Get("/users/:id", middleware.OptionalAuth, handlers.GetProfileById)

	// Collections (Phase 5)
	api.Post("/collections", handlers.CreateCollection)
	api.Post("/collections/:id/components/:componentId", handlers.AddComponentToCollection)
	api.Delete("/collections/:id/components/:componentId", handlers.RemoveComponentFromCollection)
	// OptionalAuth so an owner can see their own private collections
	app.Get("/users/:id/collections", middleware.OptionalAuth, handlers.ListUserCollections)
	app.Get("/collections/:id", middleware.OptionalAuth, handlers.GetCollection)

	// Follows (Phase 5) — feeds the notification hooks in AddVersion/AutoDeploy/webhook
	api.Post("/follows", handlers.CreateFollow)
	api.Delete("/follows", handlers.DeleteFollow)

	// Notifications (Phase 5)
	api.Get("/notifications", handlers.ListNotifications)
	api.Post("/notifications/:id/read", handlers.MarkNotificationRead)
	api.Post("/notifications/read-all", handlers.MarkAllNotificationsRead)

	// GitHub browsing (Phase 4.2)
	gh := api.Group("/github")
	gh.Get("/repos", githubapi.ListUserRepos)
	gh.Get("/contents", githubapi.GetRepoContents)
	gh.Get("/branches", githubapi.GetBranch)
	gh.Get("/autofill", handlers.AutofillFromRepo)
}
