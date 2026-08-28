# Ateform MCP server

This package exposes Ateform as an authenticated remote MCP server over Streamable HTTP. It is designed for clients such as ChatGPT or another MCP-capable assistant: the client can inspect a meal photo, propose portions and nutrients, ask the user to confirm, then call `log_meal`.

The server does not receive or analyze image files itself. That is intentional: the connected AI client handles vision, while Ateform validates and stores structured values. This keeps the integration model-independent and avoids duplicating an image-analysis pipeline.

## Security model

- Supabase Auth is the OAuth 2.1 authorization server.
- Every MCP request has its bearer token verified by Supabase Auth.
- The same user token is passed to the Supabase client, so existing RLS policies restrict every query and mutation to that user.
- A Supabase service-role key is never used.
- Mutation tools have MCP safety annotations. Meal deletion is marked destructive.
- Meal, workout, and cardio retries use idempotency keys to avoid duplicate writes.
- AI meal items keep source, model, confidence, client, original label, and eating time metadata.

## Tools

| Tool | Purpose |
| --- | --- |
| `get_today_summary` | Nutrition, goals, workout, cardio, steps, and body data for a day |
| `search_foods` | Search the deployed Ateform `food-search` Edge Function |
| `log_meal` | Save a confirmed structured meal, including photo estimates |
| `update_meal` | Correct an item, portion, nutrients, or confidence |
| `delete_meal` | Delete one meal session |
| `log_workout` | Create or replace a dated strength session |
| `log_cardio` | Add a retry-safe cardio entry |
| `log_body_metric` | Create or update dated body measurements |
| `get_progress_summary` | Read recent body and training history |

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

## Deploy

Deploy `mcp-server` as a Node 22 web service and set `MCP_PUBLIC_URL` to its final HTTPS endpoint, for example `https://mcp.ateform.app/mcp`. Run:

```bash
npm ci
npm run build
npm start
```

Do not expose a localhost URL to external AI clients. For ChatGPT or the OpenAI API, configure the HTTPS `/mcp` URL as a remote MCP server and complete the Supabase OAuth flow. Keep approval enabled for write tools, particularly `log_meal`, until the user has reviewed the AI estimate.

OpenAI remote MCP reference: <https://developers.openai.com/api/reference/cli/resources/responses/methods/create>
