package githubapi

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rishyym0927/storehubx/internal/cache"
	"github.com/rishyym0927/storehubx/internal/db"
	"github.com/rishyym0927/storehubx/internal/utils"
	"go.mongodb.org/mongo-driver/bson"
)

// githubMetaCacheTTL governs the enrichment endpoints added for Phase 7
// (repo info, languages, latest commit, contributors, README): all public,
// read-heavy/write-rare GitHub data, so a longer TTL than the Mongo-backed
// /components cache is fine and keeps us well under GitHub's rate limits.
const githubMetaCacheTTL = 10 * time.Minute

// githubRepoCacheKey builds a cache key shared across every user — the
// underlying GitHub data is public and identical no matter whose token
// fetched it, only the Authorization header differs per request.
func githubRepoCacheKey(kind, owner, repo string) string {
	return fmt.Sprintf("cache:github:%s:%s/%s", kind, strings.ToLower(owner), strings.ToLower(repo))
}

// cachedGitHubFetch returns the cached bytes at cacheKey if present, otherwise
// runs fetch (which should hit GitHub and return the exact bytes to cache/
// return) and caches its result when it succeeded (2xx).
func cachedGitHubFetch(cacheKey string, ttl time.Duration, fetch func() ([]byte, int, error)) ([]byte, int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if cached, hit := cache.Get(ctx, cacheKey); hit {
		return []byte(cached), 200, nil
	}

	body, status, err := fetch()
	if err != nil {
		return nil, 0, err
	}
	if status >= 200 && status < 300 {
		cache.Set(ctx, cacheKey, string(body), ttl)
	}
	return body, status, nil
}

// doGitHubGet performs an authenticated GET against the GitHub REST API and
// returns the raw response body.
// token may be empty — the Phase 7 enrichment endpoints hit public repo data
// and work fine unauthenticated (just at GitHub's lower anonymous rate limit,
// which the cache above keeps us well under).
func doGitHubGet(token, endpoint string) ([]byte, int, error) {
	req, _ := http.NewRequest("GET", endpoint, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, res.StatusCode, err
	}
	return body, res.StatusCode, nil
}

// githubErrorResponse decodes a non-2xx GitHub body for pass-through to the client.
func githubErrorResponse(c *fiber.Ctx, status int, body []byte) error {
	var errBody map[string]any
	_ = json.Unmarshal(body, &errBody)
	return c.Status(status).JSON(fiber.Map{
		"error":   "GitHub error",
		"details": errBody,
	})
}

// GetUserGitHubToken fetches the decrypted GitHub access token for the
// current authenticated user. Exported so other packages (e.g. the
// component-link autofill flow in internal/handlers) can reuse it instead of
// duplicating the lookup/decrypt logic.
func GetUserGitHubToken(c *fiber.Ctx) (string, error) {
	providerID, _ := c.Locals("user_id").(string)
	if providerID == "" {
		return "", fmt.Errorf("missing user_id in context")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	col := db.DB().Collection("users")
	var u struct {
		AccessToken string `bson:"accessToken"`
	}
	if err := col.FindOne(ctx, bson.M{"providerId": providerID}).Decode(&u); err != nil {
		return "", fmt.Errorf("user not found or no token stored")
	}

	token := utils.Decrypt(u.AccessToken)
	if token == "" {
		return "", fmt.Errorf("failed to decrypt token")
	}
	return token, nil
}

// GET /api/github/repos
// Query params (optional): page, per_page, visibility, affiliation (comma-separated)
// Pass-through from GitHub: https://docs.github.com/rest/repos/repos#list-repositories-for-the-authenticated-user
func ListUserRepos(c *fiber.Ctx) error {
	token, err := GetUserGitHubToken(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": err.Error()})
	}

	v := url.Values{}
	v.Set("page", c.Query("page", "1"))
	v.Set("per_page", c.Query("per_page", "30"))
	if visibility := c.Query("visibility", ""); visibility != "" {
		v.Set("visibility", visibility)
	}
	if affiliation := c.Query("affiliation", ""); affiliation != "" {
		v.Set("affiliation", strings.ReplaceAll(affiliation, " ", "")) // GitHub expects CSV
	}

	body, status, err := doGitHubGet(token, "https://api.github.com/user/repos?"+v.Encode())
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "GitHub request failed: " + err.Error()})
	}
	if status < 200 || status >= 300 {
		return githubErrorResponse(c, status, body)
	}

	var repos any
	if err := json.Unmarshal(body, &repos); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "decode error"})
	}
	return c.JSON(fiber.Map{"success": true, "data": repos})
}

// GET /api/github/contents
// Required: owner, repo
// Optional: path (default ""), ref (branch/tag/sha)
// Wraps: https://docs.github.com/rest/repos/contents#get-repository-content
func GetRepoContents(c *fiber.Ctx) error {
	token, err := GetUserGitHubToken(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": err.Error()})
	}

	owner := c.Query("owner")
	repo := c.Query("repo")
	if owner == "" || repo == "" {
		return c.Status(400).JSON(fiber.Map{"error": "owner and repo are required"})
	}

	endpoint := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents", url.PathEscape(owner), url.PathEscape(repo))
	if path := c.Query("path"); path != "" {
		endpoint += "/" + strings.TrimPrefix(path, "/")
	}
	if ref := c.Query("ref"); ref != "" {
		endpoint += "?ref=" + url.QueryEscape(ref)
	}

	body, status, err := doGitHubGet(token, endpoint)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "GitHub request failed: " + err.Error()})
	}
	if status < 200 || status >= 300 {
		return githubErrorResponse(c, status, body)
	}

	var payload any
	if err := json.Unmarshal(body, &payload); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "decode error"})
	}
	return c.JSON(fiber.Map{"success": true, "data": payload})
}

// GET /api/github/branches
// Required: owner, repo, branch
// Wraps: https://docs.github.com/en/rest/branches/branches?apiVersion=2022-11-28#get-a-branch
func GetBranch(c *fiber.Ctx) error {
	token, err := GetUserGitHubToken(c)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": err.Error()})
	}

	owner := c.Query("owner")
	repo := c.Query("repo")
	branch := c.Query("branch", "main")
	if owner == "" || repo == "" {
		return c.Status(400).JSON(fiber.Map{"error": "owner and repo are required"})
	}

	endpoint := fmt.Sprintf("https://api.github.com/repos/%s/%s/branches/%s",
		url.PathEscape(owner), url.PathEscape(repo), url.PathEscape(branch))

	body, status, err := doGitHubGet(token, endpoint)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "GitHub request failed: " + err.Error()})
	}
	if status < 200 || status >= 300 {
		return githubErrorResponse(c, status, body)
	}

	var payload any
	if err := json.Unmarshal(body, &payload); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "decode error"})
	}
	return c.JSON(fiber.Map{"success": true, "data": payload})
}

// ---------------------------------------------------------------------
// Phase 7 — GitHub data enrichment. Public repo read endpoints, all cached
// (see cachedGitHubFetch/githubMetaCacheTTL above) since this data is
// read-heavy/write-rare, same rationale as the /components cache.
// ---------------------------------------------------------------------

// RepoInfoLicense mirrors GitHub's trimmed `license` object.
type RepoInfoLicense struct {
	SpdxID string `json:"spdxId"`
	Name   string `json:"name"`
}

// RepoInfo is a trimmed view of `GET /repos/{owner}/{repo}` — only the
// fields items 39/40/46 actually need (stars/forks/issues, description,
// license, topics), not GitHub's full ~80-field repo object.
type RepoInfo struct {
	Stars         int              `json:"stars"`
	Forks         int              `json:"forks"`
	OpenIssues    int              `json:"openIssues"`
	Description   string           `json:"description"`
	License       *RepoInfoLicense `json:"license"`
	Topics        []string         `json:"topics"`
	DefaultBranch string           `json:"defaultBranch"`
}

// FetchRepoInfo fetches (and caches) trimmed public repo info for
// owner/repo using token. Exported so internal/handlers' component-link
// autofill flow (item 40) can reuse the same cached data instead of making
// a duplicate GitHub call.
func FetchRepoInfo(token, owner, repo string) (*RepoInfo, error) {
	body, status, err := cachedGitHubFetch(githubRepoCacheKey("repoinfo", owner, repo), githubMetaCacheTTL, func() ([]byte, int, error) {
		endpoint := fmt.Sprintf("https://api.github.com/repos/%s/%s", url.PathEscape(owner), url.PathEscape(repo))
		raw, status, err := doGitHubGet(token, endpoint)
		if err != nil || status < 200 || status >= 300 {
			return raw, status, err
		}
		var gh struct {
			StargazersCount int              `json:"stargazers_count"`
			ForksCount      int              `json:"forks_count"`
			OpenIssuesCount int              `json:"open_issues_count"`
			Description     string           `json:"description"`
			DefaultBranch   string           `json:"default_branch"`
			Topics          []string         `json:"topics"`
			License         *RepoInfoLicense `json:"license"`
		}
		if err := json.Unmarshal(raw, &gh); err != nil {
			return nil, 500, err
		}
		out, err := json.Marshal(RepoInfo{
			Stars:         gh.StargazersCount,
			Forks:         gh.ForksCount,
			OpenIssues:    gh.OpenIssuesCount,
			Description:   gh.Description,
			License:       gh.License,
			Topics:        gh.Topics,
			DefaultBranch: gh.DefaultBranch,
		})
		return out, status, err
	})
	if err != nil {
		return nil, err
	}
	if status < 200 || status >= 300 {
		return nil, fmt.Errorf("github repo info request failed (status %d)", status)
	}
	var info RepoInfo
	if err := json.Unmarshal(body, &info); err != nil {
		return nil, err
	}
	return &info, nil
}

// GET /github/repo-info?owner=&repo=  (public — repo metadata, no viewer token needed)
// Stars/forks/open issues, description, license, topics (items 39/40/46).
func GetRepoInfo(c *fiber.Ctx) error {
	owner := c.Query("owner")
	repo := c.Query("repo")
	if owner == "" || repo == "" {
		return c.Status(400).JSON(fiber.Map{"error": "owner and repo are required"})
	}

	info, err := FetchRepoInfo("", owner, repo)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "GitHub request failed: " + err.Error()})
	}
	return c.JSON(fiber.Map{"success": true, "data": info})
}

// GET /github/languages?owner=&repo=  (public)
// Pass-through of `GET /repos/{owner}/{repo}/languages` (already a compact
// language->bytes map, no trimming needed) — item 41.
func GetLanguages(c *fiber.Ctx) error {
	owner := c.Query("owner")
	repo := c.Query("repo")
	if owner == "" || repo == "" {
		return c.Status(400).JSON(fiber.Map{"error": "owner and repo are required"})
	}

	body, status, err := cachedGitHubFetch(githubRepoCacheKey("languages", owner, repo), githubMetaCacheTTL, func() ([]byte, int, error) {
		endpoint := fmt.Sprintf("https://api.github.com/repos/%s/%s/languages", url.PathEscape(owner), url.PathEscape(repo))
		return doGitHubGet("", endpoint)
	})
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "GitHub request failed: " + err.Error()})
	}
	if status < 200 || status >= 300 {
		return githubErrorResponse(c, status, body)
	}
	c.Set("Content-Type", "application/json")
	return c.SendString(fmt.Sprintf(`{"success":true,"data":%s}`, string(body)))
}

// LatestCommit is a trimmed view of the newest entry from
// `GET /repos/{owner}/{repo}/commits?per_page=1`.
type LatestCommit struct {
	SHA        string `json:"sha"`
	Message    string `json:"message"`
	AuthorName string `json:"authorName"`
	Date       string `json:"date"`
	HTMLURL    string `json:"htmlUrl"`
}

// GET /github/latest-commit?owner=&repo=&ref=  (public)
// Real commit message + author + date instead of a bare SHA — item 42.
func GetLatestCommit(c *fiber.Ctx) error {
	owner := c.Query("owner")
	repo := c.Query("repo")
	ref := c.Query("ref")
	if owner == "" || repo == "" {
		return c.Status(400).JSON(fiber.Map{"error": "owner and repo are required"})
	}

	cacheKey := githubRepoCacheKey("latest-commit:"+ref, owner, repo)
	body, status, err := cachedGitHubFetch(cacheKey, githubMetaCacheTTL, func() ([]byte, int, error) {
		v := url.Values{}
		v.Set("per_page", "1")
		if ref != "" {
			v.Set("sha", ref)
		}
		endpoint := fmt.Sprintf("https://api.github.com/repos/%s/%s/commits?%s", url.PathEscape(owner), url.PathEscape(repo), v.Encode())
		raw, status, err := doGitHubGet("", endpoint)
		if err != nil || status < 200 || status >= 300 {
			return raw, status, err
		}
		var commits []struct {
			SHA    string `json:"sha"`
			Commit struct {
				Message string `json:"message"`
				Author  struct {
					Name string `json:"name"`
					Date string `json:"date"`
				} `json:"author"`
			} `json:"commit"`
			HTMLURL string `json:"html_url"`
		}
		if err := json.Unmarshal(raw, &commits); err != nil {
			return nil, 500, err
		}
		if len(commits) == 0 {
			return []byte(`{"error":"no commits found"}`), 404, nil
		}
		latest := commits[0]
		out, err := json.Marshal(LatestCommit{
			SHA:        latest.SHA,
			Message:    latest.Commit.Message,
			AuthorName: latest.Commit.Author.Name,
			Date:       latest.Commit.Author.Date,
			HTMLURL:    latest.HTMLURL,
		})
		return out, status, err
	})
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "GitHub request failed: " + err.Error()})
	}
	if status < 200 || status >= 300 {
		return githubErrorResponse(c, status, body)
	}
	c.Set("Content-Type", "application/json")
	return c.SendString(fmt.Sprintf(`{"success":true,"data":%s}`, string(body)))
}

// Contributor is a trimmed view of one entry from
// `GET /repos/{owner}/{repo}/contributors`.
type Contributor struct {
	Login         string `json:"login"`
	AvatarURL     string `json:"avatarUrl"`
	HTMLURL       string `json:"htmlUrl"`
	Contributions int    `json:"contributions"`
}

// GET /github/contributors?owner=&repo=  (public)
// Top contributors (capped at 12) for an avatar stack — item 43.
func GetContributors(c *fiber.Ctx) error {
	owner := c.Query("owner")
	repo := c.Query("repo")
	if owner == "" || repo == "" {
		return c.Status(400).JSON(fiber.Map{"error": "owner and repo are required"})
	}

	body, status, err := cachedGitHubFetch(githubRepoCacheKey("contributors", owner, repo), githubMetaCacheTTL, func() ([]byte, int, error) {
		endpoint := fmt.Sprintf("https://api.github.com/repos/%s/%s/contributors?per_page=12", url.PathEscape(owner), url.PathEscape(repo))
		raw, status, err := doGitHubGet("", endpoint)
		if err != nil || status < 200 || status >= 300 {
			return raw, status, err
		}
		var ghContributors []struct {
			Login         string `json:"login"`
			AvatarURL     string `json:"avatar_url"`
			HTMLURL       string `json:"html_url"`
			Contributions int    `json:"contributions"`
		}
		if err := json.Unmarshal(raw, &ghContributors); err != nil {
			return nil, 500, err
		}
		trimmed := make([]Contributor, 0, len(ghContributors))
		for _, gc := range ghContributors {
			trimmed = append(trimmed, Contributor{
				Login:         gc.Login,
				AvatarURL:     gc.AvatarURL,
				HTMLURL:       gc.HTMLURL,
				Contributions: gc.Contributions,
			})
		}
		out, err := json.Marshal(trimmed)
		return out, status, err
	})
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "GitHub request failed: " + err.Error()})
	}
	if status < 200 || status >= 300 {
		return githubErrorResponse(c, status, body)
	}
	c.Set("Content-Type", "application/json")
	return c.SendString(fmt.Sprintf(`{"success":true,"data":%s}`, string(body)))
}

// FetchReadmeContent fetches (and caches) the decoded README markdown for
// owner/repo@ref. Exported so the autofill flow (internal/handlers) can reuse
// it instead of duplicating the base64-decode logic in GetReadme.
func FetchReadmeContent(owner, repo, ref string) (string, error) {
	cacheKey := githubRepoCacheKey("readme:"+ref, owner, repo)
	body, status, err := cachedGitHubFetch(cacheKey, githubMetaCacheTTL, func() ([]byte, int, error) {
		endpoint := fmt.Sprintf("https://api.github.com/repos/%s/%s/readme", url.PathEscape(owner), url.PathEscape(repo))
		if ref != "" {
			endpoint += "?ref=" + url.QueryEscape(ref)
		}
		raw, status, err := doGitHubGet("", endpoint)
		if err != nil || status < 200 || status >= 300 {
			return raw, status, err
		}
		var gh struct {
			Content  string `json:"content"`
			Encoding string `json:"encoding"`
		}
		if err := json.Unmarshal(raw, &gh); err != nil {
			return nil, 500, err
		}
		content := gh.Content
		if gh.Encoding == "base64" {
			cleaned := strings.ReplaceAll(gh.Content, "\n", "")
			decoded, err := base64.StdEncoding.DecodeString(cleaned)
			if err != nil {
				return nil, 500, err
			}
			content = string(decoded)
		}
		out, err := json.Marshal(fiber.Map{"content": content})
		return out, status, err
	})
	if err != nil {
		return "", err
	}
	if status < 200 || status >= 300 {
		return "", fmt.Errorf("github readme request failed (status %d)", status)
	}
	var parsed struct {
		Content string `json:"content"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", err
	}
	return parsed.Content, nil
}

// GET /api/github/readme?owner=&repo=&ref=
// Decoded README markdown content for the detail-page README tab — item 44.
func GetReadme(c *fiber.Ctx) error {
	owner := c.Query("owner")
	repo := c.Query("repo")
	ref := c.Query("ref")
	if owner == "" || repo == "" {
		return c.Status(400).JSON(fiber.Map{"error": "owner and repo are required"})
	}

	content, err := FetchReadmeContent(owner, repo, ref)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "GitHub request failed: " + err.Error()})
	}
	return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"content": content}})
}

// PackageJSON is a trimmed view of a repo's package.json — just enough to
// detect frameworks (repo autofill).
type PackageJSON struct {
	Dependencies    map[string]string `json:"dependencies"`
	DevDependencies map[string]string `json:"devDependencies"`
}

// frameworkDeps maps a package.json dependency name to the framework tag it
// implies. DetectFrameworks dedupes across dependencies/devDependencies.
var frameworkDeps = map[string]string{
	"react":         "react",
	"vue":           "vue",
	"svelte":        "svelte",
	"@angular/core": "angular",
	"solid-js":      "solid",
	"preact":        "preact",
	"next":          "nextjs",
	"nuxt":          "nuxt",
}

// DetectFrameworks returns the deduplicated set of frameworks implied by a
// package.json's dependencies/devDependencies, using frameworkDeps.
func DetectFrameworks(pkg *PackageJSON) []string {
	if pkg == nil {
		return nil
	}
	seen := map[string]bool{}
	var out []string
	check := func(deps map[string]string) {
		for dep, name := range frameworkDeps {
			if _, ok := deps[dep]; ok && !seen[name] {
				seen[name] = true
				out = append(out, name)
			}
		}
	}
	check(pkg.Dependencies)
	check(pkg.DevDependencies)
	return out
}

// FetchPackageJSON fetches and decodes package.json at path/ref in
// owner/repo, authenticated as token. Returns (nil, nil) — not an error — if
// the repo has no package.json at that location (e.g. a non-JS component).
func FetchPackageJSON(token, owner, repo, path, ref string) (*PackageJSON, error) {
	pkgPath := "package.json"
	if trimmed := strings.Trim(path, "/"); trimmed != "" {
		segments := strings.Split(trimmed, "/")
		for i, s := range segments {
			segments[i] = url.PathEscape(s)
		}
		pkgPath = strings.Join(segments, "/") + "/package.json"
	}
	endpoint := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s", url.PathEscape(owner), url.PathEscape(repo), pkgPath)
	if ref != "" {
		endpoint += "?ref=" + url.QueryEscape(ref)
	}

	raw, status, err := doGitHubGet(token, endpoint)
	if err != nil {
		return nil, err
	}
	if status == 404 {
		return nil, nil
	}
	if status < 200 || status >= 300 {
		return nil, fmt.Errorf("github contents request failed (status %d)", status)
	}

	var gh struct {
		Content  string `json:"content"`
		Encoding string `json:"encoding"`
	}
	if err := json.Unmarshal(raw, &gh); err != nil {
		return nil, err
	}
	content := gh.Content
	if gh.Encoding == "base64" {
		cleaned := strings.ReplaceAll(gh.Content, "\n", "")
		decoded, err := base64.StdEncoding.DecodeString(cleaned)
		if err != nil {
			return nil, err
		}
		content = string(decoded)
	}

	var pkg PackageJSON
	if err := json.Unmarshal([]byte(content), &pkg); err != nil {
		return nil, err
	}
	return &pkg, nil
}
