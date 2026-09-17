# Ateform MCP server

This package exposes Ateform as an authenticated remote MCP server over Streamable HTTP, for clients such as Claude or ChatGPT. It covers everything a user can do in the app itself: search foods and log meals (including AI-estimated ones from a photo, after user confirmation), manage reusable meal and cardio-session templates, log and manage strength/cardio/steps/body-metric entries, manage weekly training programs, and read or update the user's profile and targets.

The server does not receive or analyze image files itself. That is intentional: the connected AI client handles vision, while Ateform validates and stores structured values. This keeps the integration model-independent and avoids duplicating an image-analysis pipeline.

## Security model

- Supabase Auth is the OAuth 2.1 authorization server.
- Every MCP request has its bearer token verified by Supabase Auth.
- The same user token is passed to the Supabase client, so existing RLS policies restrict every query and mutation to that user.
- A Supabase service-role key is never used.
- Mutation tools have MCP safety annotations. Meal deletion is marked destructive.
- Meal and cardio logging (including from saved templates) use idempotency keys to avoid duplicate writes on retry. Workouts and body metrics upsert by date instead, so a retry naturally overwrites the same row rather than duplicating it.
- AI meal items keep source, model, confidence, client, original label, and eating time metadata.

## Tools

Every write tool is scoped to the authenticated user via Supabase RLS — there is no way for one Ateform user's session to touch another's data, regardless of what a tool call asks for.

**Today & food**

| Tool | Purpose |
| --- | --- |
| `get_today_summary` | Nutrition, goals, workout, cardio, steps, and body data for a day |
| `list_meals` | List logged meal items across a date range, grouped by day with totals |
| `search_foods` | Search the deployed Ateform `food-search` Edge Function |
| `log_meal` | Save a confirmed structured meal, including photo estimates |
| `update_meal` | Correct an item, portion, nutrients, or confidence |
| `delete_meal` | Delete one meal session |
| `delete_meal_item` | Delete a single food item without deleting the rest of that meal |
| `list_saved_meals` | List reusable meal templates (e.g. "Usual breakfast") |
| `save_meal` | Create or update a reusable meal template |
| `delete_saved_meal` | Delete a reusable meal template |
| `log_saved_meal` | Log a saved meal's items for a date/meal type |

**Training**

| Tool | Purpose |
| --- | --- |
| `log_workout` | Create or replace a dated strength session |
| `delete_workout` | Delete a dated strength session |
| `search_exercises` | Find canonical exercise names/muscle group from Ateform's library |
| `list_programs` | List saved weekly training programs |
| `save_program` | Create or update a weekly program (name + per-day exercises) |
| `delete_program` | Delete a training program |

**Cardio**

| Tool | Purpose |
| --- | --- |
| `log_cardio` | Log a cardio entry; auto-estimates calories from ACSM/Compendium formulas when a `machine` and its speed/incline/watts/step-rate are given |
| `delete_cardio` | Delete a cardio entry |
| `list_saved_cardio_sessions` | List reusable cardio session templates (e.g. a regular treadmill routine) |
| `save_cardio_session` | Create or update a reusable cardio session template |
| `delete_saved_cardio_session` | Delete a reusable cardio session template |
| `log_saved_cardio_session` | Log a saved cardio session, re-estimating calories from current bodyweight |
| `log_steps` | Create or update the step count for a date |

**Body & profile**

| Tool | Purpose |
| --- | --- |
| `log_body_metric` | Create or update dated body measurements |
| `delete_body_metric` | Delete a dated body measurement entry |
| `get_progress_summary` | Read recent body and training history |
| `list_progress_photos` | List progress photos with a temporary signed URL each |
| `upload_progress_photo` | Upload a base64-encoded progress photo for a date |
| `delete_progress_photo` | Delete a progress photo |
| `get_profile` | Read personal details and daily nutrition/activity targets |
| `update_profile` | Update any subset of personal details or targets |

Deliberately not exposed: changing the account's email or password. That stays app-only — an AI-driven credential change is an account-takeover risk not worth taking.

## Supabase setup

1. Apply the migrations from the repository root:

   ```bash
   supabase db push
   ```

2. In the Supabase dashboard, enable **Authentication → OAuth Server**. Keep Dynamic Client Registration enabled for MCP clients that register themselves.

3. Configure the Site URL and redirect allow list for the actual AI client you will connect. Supabase's OAuth consent screen is what allows each Ateform user to authorize that client.

4. Deploy the existing `food-search` function if `search_foods` should be available.

Supabase OAuth server guide: <https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication>

## Run locally

Node 22 or newer is required.

```bash
cd mcp-server
npm install
copy .env.example .env
npm run dev
```

Fill `.env` with:

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
MCP_PUBLIC_URL=http://localhost:8787/mcp
PORT=8787
ALLOWED_ORIGINS=https://chatgpt.com
```

`GET /health` is public. The MCP endpoint and all user data require a valid Supabase access token. OAuth discovery is published at the RFC 9728 well-known URL derived from `MCP_PUBLIC_URL`.

## Deploy (Hostinger VPS, running live at mcp.ateform.space)

The VPS already runs an `n8n` stack behind Traefik on ports 80/443 (network `n8n_default`, ACME resolver `mytlschallenge`). Rather than run a second webserver, `ateform-mcp` is its own Docker Compose project that joins that same external network — Traefik's docker provider picks it up from its labels and issues its own Let's Encrypt cert for `mcp.ateform.space`, with zero changes to the n8n stack itself.

1. DNS: an A record `mcp` → the VPS IP, under `ateform.space`'s zone.
2. Copy this `mcp-server` directory to the VPS (e.g. `/docker/ateform-mcp`), and write a `.env` there (not committed — see `.env.example` for the shape; `MCP_PUBLIC_URL=https://mcp.ateform.space/mcp`, `PORT=8787`).
3. `docker compose up -d --build` inside that directory. `Dockerfile` and `docker-compose.yml` in this folder define the build and the Traefik labels (`Host(\`mcp.ateform.space\`)`, entrypoints `web,websecure`, `tls.certresolver=mytlschallenge`).
4. Verify: `curl https://mcp.ateform.space/health` → `{"ok":true,...}`, and `curl https://mcp.ateform.space/.well-known/oauth-protected-resource/mcp` returns the RFC 9728 metadata pointing at the Supabase authorization server.
5. Redeploy after a code change: re-copy the folder (or `git pull` if cloned), then `docker compose up -d --build` again.

`ecosystem.config.cjs` is kept as an alternative for a plain VPS without Docker/Traefik already in the way — `pm2 start ecosystem.config.cjs` plus your own reverse proxy (Caddy, nginx) for TLS.

Do not expose a localhost URL to external AI clients. For ChatGPT or the OpenAI API, configure the HTTPS `/mcp` URL as a remote MCP server and complete the Supabase OAuth flow. Keep approval enabled for write tools, particularly `log_meal`, until the user has reviewed the AI estimate.

OpenAI remote MCP reference: <https://developers.openai.com/api/reference/cli/resources/responses/methods/create>
