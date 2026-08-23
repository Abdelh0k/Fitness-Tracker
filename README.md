# Ateform

Mobile-first food, training, body metric, and progress photo tracker.

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
