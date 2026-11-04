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

## Travel Concierge (My Profile) · optional AI note

The Travel Concierge on `profile/` builds every itinerary **rule-based in the browser** (`assets/js/itinerary.js`):
Visit Orlando listings in the trip dates, the comp-set hotels, the visit guide and the Google Flights link for the
home airport. It needs no key and no proxy, and that never changes.

When `proxyUrl` is set, the same proxy adds one extra: after a fresh plan is built, `assets/js/concierge.js` POSTs one
short request (user turn ≤ 500 chars, `context.page = "profile"`, the plan's Visit Orlando events) and shows the reply
as "A note from Isla" above the days (rendered as plain text). If `proxyUrl` is empty, the endpoint errors, returns no
`reply`, or takes longer than 12 s, nothing is shown and the plan is identical — a silent fallback.

Switch it on (the same steps as above, once for the whole site):
1. Deploy this folder to Vercel (Root Directory = `assistant-proxy`), with `LLM_API_KEY` set as a Sensitive
   Production environment variable (plus `LLM_PROVIDER` / `LLM_MODEL` if not xAI defaults).
2. Make sure `ALLOWED_ORIGINS` includes the site origin (`https://callumcbab777.github.io` is the default). For a
   raw.githack preview add `https://raw.githack.com` temporarily.
3. Test with the curl in step 6 above.
4. Set `proxyUrl: "https://<project-name>.vercel.app/api/chat"` in `assets/js/assistant-config.js` and merge via a PR.
   The site assistant and the Travel Concierge note both switch on. The key never goes in that file or anywhere in
   the repo.

## Structured tasks: chat-box parsing, Generate, and "Ask Isla what's on"

Three more features use the same endpoint with a `task` field. Each asks the model for **one JSON object**
(`response_format: json_object` for xAI/OpenAI), the proxy parses and checks it, and returns `{ "data": … }`; anything
else is a `502`. The browser checks the data **again** and uses its own rule-based answer on any error, invalid JSON or
timeout, so with `proxyUrl` empty every feature still works, just without AI.

| `task` | Used by | Model must return | Checks | Timeout / temperature |
|---|---|---|---|---|
| `trip_parse` | Travel Concierge chat box ("Tell Isla about your trip") | `{adults?, kids?, kid_ages?, pace?, interests?, budget?, from?, nights?, home?, access?}` | proxy: no unknown keys; browser: `AMBAR_TRIP_PARSE.validate` (types, ranges, allowed values, future date, 3-letter airport) | 8 s / 0 |
| `itinerary_picks` | Travel Concierge **Generate** | `{event_ids: [...]}` | only ids from the ≤25 listings the browser sent (shuffled by the plan's seed); the rules then place them | 9 s / 0.9 (client-sent, clamped 0.2–1) |
| `events_answer` | events page **Ask Isla what's on** | `{answer, event_ids}` | only ids that were sent AND exist in `data/visitorlando_events.json`; links are rebuilt from the data; markdown/URLs stripped | 9 s / 0.2 |

The events subset is ranked in the browser (`assets/js/events-ask.js` `candidates()`), so the model only ever sees
real listings and is told never to invent events. Without the proxy, the same module answers by rules (audience,
dates, category, keywords) and says plainly when nothing matches.

### Switch everything on: what Callum (or Karen) does

Nothing in the repo holds a key; the only repo change is the endpoint URL.

1. **Vercel login (Callum):** on any machine, `npx vercel login`, choose *Continue with GitHub/Email*, and approve the
   device code / email link. (Or in the browser: vercel.com → sign up/in with the GitHub account that owns the repo.)
2. **Create the project:** vercel.com → *Add New → Project* → import `callumcbab777/ambar-orlando-market-analysis`,
   **Root Directory `assistant-proxy`**, preset *Other*, no build command.
3. **Add the key yourself:** *Settings → Environment Variables* → `LLM_API_KEY` = your xAI key, **Production**,
   marked *Sensitive*. Optional: `LLM_PROVIDER` (`xai` default, or `openai` / `custom` + `LLM_BASE_URL`),
   `LLM_MODEL`, and `ALLOWED_ORIGINS` (default `https://callumcbab777.github.io`; add `https://raw.githack.com`
   only while testing a preview). Never paste the key into chat, the repo or `assistant-config.js`.
4. **Deploy**, then test (expect `{"data":{…"home":"MAN"…}}`):
   ```bash
   curl -s https://<project>.vercel.app/api/chat -H 'Origin: https://callumcbab777.github.io' -H 'Content-Type: application/json' \
     -d '{"task":"trip_parse","messages":[{"role":"user","content":"Family of 4 from Manchester, kids 3 and 6, a week in April"}],"context":{"today":"2026-11-04"}}'
   ```
5. Tell the site agent the endpoint URL; it opens a PR setting `proxyUrl` in `assets/js/assistant-config.js`. When that
   PR is merged, the site assistant, the concierge note, chat-box parsing, AI Generate picks and Ask Isla all switch on
   together. To switch off again, set `proxyUrl: ""` (or delete the Vercel env var: everything falls back to rules).

## Test locally (no key, no network)

```bash
node assistant-proxy/test/smoke.js   # mocked LLM; checks CORS, limits, sanitising, grounding from the server index, 503 without a key
```
