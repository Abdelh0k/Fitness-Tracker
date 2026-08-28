alter table public.meal_entries
  add column meal_source text not null default 'manual'
    check (meal_source in ('manual', 'ai_photo', 'ai_text', 'ai_voice', 'barcode', 'import')),
  add column source_metadata jsonb not null default '{}'::jsonb,
  add column idempotency_key text,
  add column eaten_at timestamptz not null default now();

create unique index meal_entries_user_idempotency_idx
  on public.meal_entries(user_id, idempotency_key)
  where idempotency_key is not null;

comment on column public.meal_entries.meal_source is
  'How this food item entered Ateform. AI sources are estimates and should remain editable.';

comment on column public.meal_entries.source_metadata is
  'Non-authoritative provenance such as model name, confidence, client ID, and the original item label.';

comment on column public.meal_entries.idempotency_key is
  'Caller-supplied retry key. MCP clients should reuse it when retrying the same logical meal item.';

comment on column public.meal_entries.eaten_at is
  'When the user ate the item; separate from created_at so delayed AI logging keeps the correct timeline.';

alter table public.strength_sessions
  add column entry_source text not null default 'manual'
    check (entry_source in ('manual', 'ai_photo', 'ai_text', 'ai_voice', 'import')),
  add column source_metadata jsonb not null default '{}'::jsonb,
  add column idempotency_key text;

create unique index strength_sessions_user_idempotency_idx
  on public.strength_sessions(user_id, idempotency_key)
  where idempotency_key is not null;

alter table public.cardio_entries
  add column entry_source text not null default 'manual'
    check (entry_source in ('manual', 'ai_photo', 'ai_text', 'ai_voice', 'import')),
  add column source_metadata jsonb not null default '{}'::jsonb,
  add column idempotency_key text;

create unique index cardio_entries_user_idempotency_idx
  on public.cardio_entries(user_id, idempotency_key)
  where idempotency_key is not null;

alter table public.body_metrics
  add column entry_source text not null default 'manual'
    check (entry_source in ('manual', 'ai_photo', 'ai_text', 'ai_voice', 'import')),
  add column source_metadata jsonb not null default '{}'::jsonb;

comment on column public.strength_sessions.entry_source is
  'How this workout entered Ateform. MCP-created entries retain their AI provenance.';

comment on column public.cardio_entries.entry_source is
  'How this cardio entry entered Ateform. MCP-created entries retain their AI provenance.';

comment on column public.body_metrics.entry_source is
  'How this body measurement entered Ateform. MCP-created entries retain their AI provenance.';
