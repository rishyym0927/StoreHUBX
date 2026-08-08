# StoreHUBX Client

Next.js 15 (App Router, React 19) frontend for StoreHUBX. See the [repo root README](../README.md) for full local setup (backend, Docker services, env vars) and [CLAUDE.md](../CLAUDE.md) for an architecture overview.

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm run lint
```

Requires `NEXT_PUBLIC_API_BASE` in `.env.local`, pointing at the backend API (e.g. `http://localhost:8080`).

Styling is Tailwind v4 with a hand-rolled "brutalist" design system (sharp corners, 2px borders, hard offset drop-shadows) — no component library. Icons are `lucide-react` throughout. See `CLAUDE.md`'s Frontend architecture section before adding new UI patterns.
