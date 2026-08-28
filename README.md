# Ateform

Mobile-first nutrition and fitness tracker with four primary areas: Today, Food, Training, and Body & Progress.

## Local development

```bash
npm install
npm run dev
```

The app can run in local test mode with no environment variables. To enable accounts, sync, food API search, and private progress photo storage, connect Supabase.

## Supabase setup

1. Create or open your Supabase project.
2. Copy `.env.example` to `.env.local` and fill:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

3. Link and apply the migration:

```bash
supabase login
supabase link --project-ref your-project-ref
supabase db push
```

4. Deploy the food search Edge Function:

```bash
supabase secrets set USDA_API_KEY=your_usda_fooddata_central_key
supabase secrets set OPENFOODFACTS_USER_AGENT="Ateform/0.1 (contact: your@email.com)"
supabase functions deploy food-search
```

USDA has a free API key option. Without a key, the function falls back to `DEMO_KEY`, which is only suitable for quick testing.

## Hosting

Build output is generated with:

```bash
npm run build
```

For Hostinger, use **Deploy Web App**, connect this repo, set build command `npm run build`, output directory `dist`, and add the same `VITE_` environment variables.

## AI and MCP integration

The authenticated remote MCP server lives in [`mcp-server`](./mcp-server). It lets an AI client read the user's current data and log user-approved meals, workouts, cardio, and body measurements. The AI client performs image understanding; Ateform receives structured nutrition values and stores the original AI provenance and confidence.

Before deploying it, apply all Supabase migrations and enable the Supabase OAuth 2.1 server. See [`mcp-server/README.md`](./mcp-server/README.md) for configuration, security behavior, supported tools, and connection instructions.
