create table public.saved_cardio_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  machine text not null,
  duration_min integer,
  distance_km numeric(6,2),
  speed_kmh numeric(5,2),
  incline_percent numeric(4,1),
  watts numeric(6,1),
  step_rate numeric(5,1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index saved_cardio_sessions_user_idx on public.saved_cardio_sessions(user_id);

create trigger saved_cardio_sessions_set_updated_at before update on public.saved_cardio_sessions
for each row execute function public.set_updated_at();

alter table public.saved_cardio_sessions enable row level security;
grant select, insert, update, delete on public.saved_cardio_sessions to authenticated;

create policy "Users can select own saved cardio sessions" on public.saved_cardio_sessions
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own saved cardio sessions" on public.saved_cardio_sessions
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own saved cardio sessions" on public.saved_cardio_sessions
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own saved cardio sessions" on public.saved_cardio_sessions
for delete to authenticated
using ((select auth.uid()) = user_id);
