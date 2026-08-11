package storage

import (
	"strings"
	"testing"
)

// TestRewriteIndexHTMLPaths covers the index.html rewriting that makes a
// bundle servable from a components/<slug>/<version>/ prefix instead of the
// domain root. This is the highest-regression-risk part of publishing: a bad
// rewrite yields a build that succeeds and a preview that renders blank.
func TestRewriteIndexHTMLPaths(t *testing.T) {
	tests := []struct {
		name        string
		in          string
		wantContain []string
		wantAbsent  []string
	}{
		{
			// The path that already worked before the full-tree mirror; must stay working.
			name:        "vite root-absolute assets become relative",
			in:          `<html><head><script type="module" src="/assets/index-abc123.js"></script><link rel="stylesheet" href="/assets/index-def456.css"></head><body></body></html>`,
			wantContain: []string{`src="assets/index-abc123.js"`, `href="assets/index-def456.css"`},
			wantAbsent:  []string{`"/assets/`},
		},
		{
			name:        "cra static dir is relativized, not flattened",
			in:          `<html><head><link href="/static/css/main.a1b2.chunk.css" rel="stylesheet"></head><body><script src="/static/js/main.c3d4.chunk.js"></script></body></html>`,
			wantContain: []string{`href="static/css/main.a1b2.chunk.css"`, `src="static/js/main.c3d4.chunk.js"`},
			wantAbsent:  []string{`"/static/`, `assets/main`},
		},
		{
			name:        "astro underscore dir preserved",
			in:          `<html><head><link rel="stylesheet" href="/_astro/index.xyz.css"></head><body></body></html>`,
			wantContain: []string{`href="_astro/index.xyz.css"`},
		},
		{
			name:        "angular base href rewritten to dot-slash",
			in:          `<html><head><base href="/"><script src="main-abc.js"></script></head><body></body></html>`,
			wantContain: []string{`<base href="./"`, `src="main-abc.js"`},
			wantAbsent:  []string{`<base href="/"`},
		},
		{
			name:        "external and protocol-relative urls untouched",
			in:          `<html><head><link href="https://fonts.googleapis.com/css?family=Inter" rel="stylesheet"><script src="//cdn.example.com/lib.js"></script></head><body></body></html>`,
			wantContain: []string{`href="https://fonts.googleapis.com/css?family=Inter"`, `src="//cdn.example.com/lib.js"`},
		},
		{
			name:        "already-relative refs untouched",
			in:          `<html><head><script src="./assets/app.js"></script><link href="assets/app.css" rel="stylesheet"></head><body></body></html>`,
			wantContain: []string{`src="./assets/app.js"`, `href="assets/app.css"`},
		},
		{
			name:        "query and hash suffixes preserved",
			in:          `<html><head><link href="/assets/app.css?v=2" rel="stylesheet"></head><body></body></html>`,
			wantContain: []string{`href="assets/app.css?v=2"`},
		},
		{
			name:        "srcset entries relativized with descriptors intact",
			in:          `<html><body><img srcset="/assets/a.png 1x, /assets/b.png 2x" src="/assets/a.png"></body></html>`,
			wantContain: []string{`assets/a.png 1x`, `assets/b.png 2x`, `src="assets/a.png"`},
			wantAbsent:  []string{`"/assets/`},
		},
		{
			name:        "data uris and fragments untouched",
			in:          `<html><body><img src="data:image/png;base64,iVBORw0KGgo="><a href="#section">x</a></body></html>`,
			wantContain: []string{`src="data:image/png;base64,iVBORw0KGgo="`, `href="#section"`},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			out, err := rewriteIndexHTMLPaths([]byte(tc.in))
			if err != nil {
				t.Fatalf("rewriteIndexHTMLPaths returned error: %v", err)
			}
			got := string(out)
			if !strings.HasPrefix(strings.TrimSpace(got), "<!DOCTYPE html>") {
				t.Errorf("expected doctype to be ensured, got: %s", got)
			}
			for _, want := range tc.wantContain {
				if !strings.Contains(got, want) {
					t.Errorf("expected output to contain %q\ngot: %s", want, got)
				}
			}
			for _, absent := range tc.wantAbsent {
				if strings.Contains(got, absent) {
					t.Errorf("expected output NOT to contain %q\ngot: %s", absent, got)
				}
			}
		})
	}
}
