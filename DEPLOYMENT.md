# Deployment — Cloudflare Workers

Technical deployment name: **`monday-night-triples`**

The backend stays on Supabase. Nothing here changes application logic or branding.

## What the build produces

`vite build` (Lovable's `@lovable.dev/vite-tanstack-config`, which already runs TanStack Start + Nitro with the `cloudflare-module` preset) emits:

- `dist/server/index.mjs` — the Worker entry (SSR + server functions)
- `dist/client/` — static assets (served through the `ASSETS` binding)
- `dist/server/wrangler.json` — generated Worker config, merged from root `wrangler.jsonc`
- `.wrangler/deploy/config.json` — redirect telling Wrangler to use the generated config

Because of the redirect file, you run `wrangler deploy` from the repo root and Wrangler picks up the generated config automatically. Do **not** point `main`/`assets` at anything by hand.

Node compatibility is enabled: `compatibility_flags: ["nodejs_compat"]` in `wrangler.jsonc` (also forced by Nitro's Cloudflare preset).

## Cloudflare Dashboard — GitHub deployment (Workers Builds)

Workers & Pages → Create → Workers → **Import a repository** → pick this repo.

| Setting | Value |
| --- | --- |
| Project / Worker name | `monday-night-triples` |
| Framework preset | None / Vite (no framework-specific preset needed) |
| Build command | `npm run build` (or `bun run build`) |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |
| Wrangler config path | leave default — the build writes `.wrangler/deploy/config.json` |
| Build output / assets | leave default — taken from `dist/server/wrangler.json` |
| Node version | 22 (set build variable `NODE_VERSION=22`) |

## Environment variables (Build + Deploy)

Add these as **build-time** variables in Cloudflare (Settings → Variables and Secrets → Build variables). They are inlined by Vite at build time, so they must exist during the build, not only at runtime.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID` — only if your build/config references it; the app code reads the first two.
- `NODE_VERSION` = `22`

Server-side runtime variables (add as Worker secrets/vars if server functions need them):

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — only if privileged server operations are used

Never commit these values; `.env` stays out of the repository.

## After the first deploy

Cloudflare assigns `https://monday-night-triples.<your-subdomain>.workers.dev`.

Update Supabase Auth (Authentication → URL Configuration):

1. **Site URL** → `https://monday-night-triples.<your-subdomain>.workers.dev`
2. **Redirect URLs** → add:
   - `https://monday-night-triples.<your-subdomain>.workers.dev/**`
   - `https://monday-night-triples.<your-subdomain>.workers.dev/auth/callback`
3. If a custom domain is later attached in Cloudflare, add the same two entries for that domain and switch Site URL to it.
4. For any OAuth provider (e.g. Google), add the Supabase callback URL to the provider console and keep the app origin in the provider's authorized origins.

## Local commands

```bash
npm run build       # production build
npm run test        # vitest suite
npm run typecheck   # TypeScript
npm run cf:preview  # build + local Workers runtime (wrangler dev)
npm run deploy      # build + wrangler deploy (manual deploy)
```
