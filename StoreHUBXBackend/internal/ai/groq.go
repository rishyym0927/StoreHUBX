// Package ai provides a narrow, fallback-only Groq client for the repo
// autofill flow: summarizing a missing repo
// description and suggesting tags when GitHub topics are sparse. It never
// runs on the common path — callers gate every call behind FallbackEnabled.
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const groqEndpoint = "https://api.groq.com/openai/v1/chat/completions"

// FallbackEnabled reports whether the AI fallback should run at all: it
// requires both an explicit opt-in and a configured key, so autofill stays
// deterministic-only by default.
func FallbackEnabled() bool {
	return os.Getenv("AUTOFILL_AI_FALLBACK_ENABLED") == "true" && os.Getenv("GROQ_API_KEY") != ""
}

// truncateRunes cuts s to at most max runes. Plain byte-slicing (s[:n]) can
// split a multi-byte UTF-8 rune in half — READMEs routinely contain emoji
// and other non-ASCII characters, so this matters in practice, not just in
// theory.
func truncateRunes(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}

func groqModel() string {
	if m := os.Getenv("GROQ_MODEL"); m != "" {
		return m
	}
	return "llama-3.1-8b-instant"
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
	Temperature float64       `json:"temperature"`
}

type chatResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
}

func chatCompletion(ctx context.Context, systemPrompt, userPrompt string, maxTokens int) (string, error) {
	apiKey := os.Getenv("GROQ_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("GROQ_API_KEY not set")
	}

	reqBody, err := json.Marshal(chatRequest{
		Model: groqModel(),
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
		MaxTokens:   maxTokens,
		Temperature: 0.3,
	})
	if err != nil {
		return "", err
	}

	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, groqEndpoint, bytes.NewReader(reqBody))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return "", err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", fmt.Errorf("groq request failed (status %d): %s", res.StatusCode, string(body))
	}

	var parsed chatResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("groq returned no choices")
	}
	return strings.TrimSpace(parsed.Choices[0].Message.Content), nil
}

// SummarizeDescription turns a README excerpt into a single-sentence
// component description. Used only when the repo has no description set.
func SummarizeDescription(ctx context.Context, readme string) (string, error) {
	excerpt := truncateRunes(readme, 500)
	if strings.TrimSpace(excerpt) == "" {
		return "", fmt.Errorf("empty readme, nothing to summarize")
	}

	system := "You write a single concise one-sentence description (max 20 words) of a software component, based on a README excerpt. Respond with ONLY the description — no quotes, no preamble, no trailing period explanation."
	out, err := chatCompletion(ctx, system, excerpt, 60)
	if err != nil {
		return "", err
	}
	return strings.Trim(out, "\" "), nil
}

// SuggestTags suggests up to 5 short lowercase tags from a README excerpt and
// package.json dependency names. Used only when GitHub topics are sparse.
func SuggestTags(ctx context.Context, readme string, depNames []string) ([]string, error) {
	excerpt := truncateRunes(readme, 800)
	if strings.TrimSpace(excerpt) == "" && len(depNames) == 0 {
		return nil, fmt.Errorf("no readme or dependencies to suggest tags from")
	}

	prompt := fmt.Sprintf("README excerpt:\n%s\n\nDependencies: %s", excerpt, strings.Join(depNames, ", "))
	system := "Suggest up to 5 short, lowercase, single-word or hyphenated tags (e.g. \"ui\", \"pricing\", \"form\") describing a software component from its README and dependencies. Respond with ONLY a comma-separated list — no numbering, no explanation."
	out, err := chatCompletion(ctx, system, prompt, 60)
	if err != nil {
		return nil, err
	}

	var tags []string
	for _, t := range strings.Split(out, ",") {
		t = strings.ToLower(strings.TrimSpace(t))
		t = strings.Trim(t, ".\"' ")
		if t != "" {
			tags = append(tags, t)
		}
	}
	if len(tags) == 0 {
		return nil, fmt.Errorf("groq returned no usable tags")
	}
	return tags, nil
}
