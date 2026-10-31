# AMBAR Orlando site assistant · proxy

A tiny serverless function that lets the static GitHub Pages site talk to an LLM **without exposing an API key**.
The site's chat widget (`assets/js/assistant.js`) runs in an offline, clearly labelled **site guide** mode (keyword search
with links, not AI) until `assets/js/assistant-config.js` → `proxyUrl` points at a deployed copy of this folder.

```
browser (GitHub Pages) ──POST {messages, context}──▶ /api/chat (Vercel, holds LLM_API_KEY) ──▶ xAI / OpenAI-compatible API
```

What it does:
- **Key stays server-side** in Vercel environment variables. Nothing secret is in the repo or the browser.
- **CORS locked** to `ALLOWED_ORIGINS` (default: `https://callumcbab777.github.io`, `http://localhost:8000`, `http://127.0.0.1:8000`). Requests with no or another `Origin` get 403.
- **Limits:** POST + JSON only; body ≤ `MAX_BODY_BYTES` (24 KB); last 8 messages, user turns ≤ 500 chars; ≤ 25 events, and only `https://www.visitorlando.com/` URLs are passed through; best-effort `RATE_LIMIT_PER_MIN` (10) per IP per warm instance; 20 s upstream timeout; `max_tokens` 400.
- **Grounded prompt, built server-side:** `knowledge.json` (copied here by `tools/build_knowledge.py`) is the site's own index. The browser sends only doc ids (≤ 8; ids not in the index are dropped) and the server adds its own BM25 retrieval (`lib/knowledge-search.js`) for the latest question. My Profile arrives as hotel and brand ids (resolved against the index; unknown ids dropped), saved Visit Orlando events (≤ 25, Visit Orlando URLs only) and sanitised preferences. The system prompt requires a link and source/"as of" for every fact, never invents or estimates rates, prices, fares or schedules (fares: point to airlines/Google Flights or gobrightline.com), links every event's Visit Orlando URL, says event listings may be stale (the `events:currency` doc with the capture date and coverage is added whenever an event is in play) and gives no financial advice. Redeploy after the index changes (Vercel redeploys on push to `main` if the project is connected).
- If the proxy is down or errors, the widget falls back to the offline site guide and says so.

## Environment variables

| Name | Required | Default | Notes |
|---|---|---|---|
| `LLM_API_KEY` | **yes** | — | Provider API key. (`XAI_API_KEY` / `OPENAI_API_KEY` also accepted for those providers.) |
| `LLM_PROVIDER` | no | `xai` | `xai`, `openai`, or `custom` (any OpenAI-compatible `/chat/completions` API). |
| `LLM_MODEL` | no | `grok-4.7` (xai), `gpt-4o-mini` (openai) | Set this explicitly to a model your key can use; for `custom` it is required. |
| `LLM_BASE_URL` | for `custom` | `https://api.x.ai/v1` / `https://api.openai.com/v1` | No trailing `/chat/completions`. |
| `ALLOWED_ORIGINS` | no | see above | Comma-separated origins, no paths. Add `https://raw.githack.com` only temporarily if you want AI on a branch preview. |
| `RATE_LIMIT_PER_MIN` | no | `10` | Per IP, per warm instance. For a hard global cap add a Vercel Firewall rate-limit rule on `/api/chat`. |
| `MAX_BODY_BYTES` | no | `24000` | |
| `SITE_URL` | no | `https://callumcbab777.github.io/ambar-orlando-market-analysis/` | Base for the absolute links in the prompt. |

Provider options:
- **xAI (default):** key from https://console.x.ai → API Keys. Base URL `https://api.x.ai/v1`. `LLM_PROVIDER=xai`, `LLM_API_KEY=<xAI key>`.
- **OpenAI:** key from https://platform.openai.com/api-keys. `LLM_PROVIDER=openai`, `LLM_API_KEY=<OpenAI key>`, `LLM_MODEL=<a current chat model>`.
- **Any OpenAI-compatible API** (e.g. a gateway): `LLM_PROVIDER=custom`, `LLM_BASE_URL=https://…/v1`, `LLM_MODEL=…`, `LLM_API_KEY=…`.

## Deploy (Vercel, ~10 minutes)

1. Create/sign in to a Vercel account (Hobby is fine) and connect the GitHub account that owns this repo.
2. **Add New → Project →** import `callumcbab777/ambar-orlando-market-analysis`.
3. Set **Root Directory = `assistant-proxy`**. Framework preset: **Other**. No build command needed.
4. Under **Environment Variables** add `LLM_API_KEY` (and optionally `LLM_PROVIDER`, `LLM_MODEL`, `ALLOWED_ORIGINS`) for Production. Mark the key as Sensitive.
5. **Deploy.** Your endpoint is `https://<project-name>.vercel.app/api/chat`.
6. Test it (must send the allowed Origin):
   ```bash
   curl -s https://<project-name>.vercel.app/api/chat \
     -H 'Origin: https://callumcbab777.github.io' -H 'Content-Type: application/json' \
     -d '{"messages":[{"role":"user","content":"What is on this weekend?"}],"context":{"page":"events","events":[]}}'
   ```
   Expect `{"reply":"…"}`. `503` means the key/provider env vars are missing; `403` means the Origin isn't allowed.
7. Paste the endpoint into **`assets/js/assistant-config.js`**: `proxyUrl: "https://<project-name>.vercel.app/api/chat"`, commit via a PR. The widget switches to "Ask Isla · Powered by Isla AI - ABI Group".

CLI alternative: `cd assistant-proxy && npx vercel link && npx vercel env add LLM_API_KEY production && npx vercel --prod`.

Other hosts: the handler is a plain Node `(req, res)` function, so it also runs on Netlify/Cloudflare with a thin adapter; Vercel is the documented path.

## Test locally (no key, no network)

```bash
node assistant-proxy/test/smoke.js   # mocked LLM; checks CORS, limits, sanitising, grounding from the server index, 503 without a key
```
