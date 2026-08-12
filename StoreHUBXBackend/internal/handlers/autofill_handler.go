package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/rishyym0927/storehubx/internal/ai"
	githubapi "github.com/rishyym0927/storehubx/internal/github"
	"github.com/rishyym0927/storehubx/internal/utils"
)

// GET /api/github/autofill?owner=&repo=&path=&ref=
// Prefills the new-component form from a GitHub repo. Description, license
// and tags come straight off the repo (RepoInfo) and frameworks are detected
// from package.json — that's the deterministic Phase 1 path, and it's what
// runs for the vast majority of repos. AI (Groq) only kicks in as a narrow
// fallback when GitHub's own data is missing:
// an empty description, or fewer than 2 topics. Every AI-derived field is
// tagged with source "ai" (vs "github") so the frontend can flag it for
// review — the field stays editable either way, this is never auto-applied.
func AutofillFromRepo(c *fiber.Ctx) error {
	owner := c.Query("owner")
	repo := c.Query("repo")
	path := c.Query("path")
	ref := c.Query("ref")
	if owner == "" || repo == "" {
		return utils.Error(c, fiber.StatusBadRequest, "owner and repo are required")
	}

	token, err := githubapi.GetUserGitHubToken(c)
	if err != nil {
		return utils.Error(c, fiber.StatusUnauthorized, err.Error())
	}

	info, err := githubapi.FetchRepoInfo(token, owner, repo)
	if err != nil {
		return utils.Error(c, fiber.StatusBadGateway, "GitHub request failed: "+err.Error())
	}

	readme, _ := githubapi.FetchReadmeContent(owner, repo, ref)

	pkg, _ := githubapi.FetchPackageJSON(token, owner, repo, path, ref)
	frameworks := githubapi.DetectFrameworks(pkg)
	if frameworks == nil {
		frameworks = []string{}
	}

	license := ""
	if info.License != nil {
		license = info.License.SpdxID
	}

	description, descriptionSource := info.Description, "github"
	tags, tagsSource := info.Topics, "github"
	if tags == nil {
		tags = []string{}
	}

	if ai.FallbackEnabled() {
		if description == "" {
			if summarized, err := ai.SummarizeDescription(c.Context(), readme); err == nil && summarized != "" {
				description = summarized
				descriptionSource = "ai"
			}
		}
		if len(tags) < 2 {
			if suggested, err := ai.SuggestTags(c.Context(), readme, depNames(pkg)); err == nil && len(suggested) > 0 {
				tags = suggested
				tagsSource = "ai"
			}
		}
	}

	return utils.Success(c, fiber.Map{
		"name":              repo,
		"description":       description,
		"descriptionSource": descriptionSource,
		"license":           license,
		"tags":              tags,
		"tagsSource":        tagsSource,
		"frameworks":        frameworks,
		"readme":            readme,
	})
}

// depNames flattens a package.json's dependencies + devDependencies down to
// just the package names, for the tag-suggestion prompt.
func depNames(pkg *githubapi.PackageJSON) []string {
	if pkg == nil {
		return nil
	}
	names := make([]string, 0, len(pkg.Dependencies)+len(pkg.DevDependencies))
	for name := range pkg.Dependencies {
		names = append(names, name)
	}
	for name := range pkg.DevDependencies {
		names = append(names, name)
	}
	return names
}
