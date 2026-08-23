create schema if not exists app_private;

create type public.goal_type as enum ('fat_loss', 'recomp', 'muscle_gain', 'maintain');
create type public.activity_level as enum ('light', 'moderate', 'active', 'very_active');
create type public.meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'You',
  age integer not null default 21 check (age between 13 and 100),
  gender text not null default 'male' check (gender in ('male', 'female')),
  height_cm numeric(5,2) not null default 182 check (height_cm between 100 and 250),
  current_weight_kg numeric(5,2) not null default 80 check (current_weight_kg between 30 and 300),
  activity_level public.activity_level not null default 'active',
  training_days_per_week integer not null default 5 check (training_days_per_week between 0 and 14),
  daily_steps_target integer not null default 7000 check (daily_steps_target between 0 and 100000),
  goal public.goal_type not null default 'recomp',
  calorie_target integer not null default 2450 check (calorie_target between 800 and 8000),
  protein_target_g integer not null default 170 check (protein_target_g between 0 and 500),
  fat_target_g integer not null default 70 check (fat_target_g between 0 and 400),
  carb_target_g integer not null default 285 check (carb_target_g between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  meal_type public.meal_type not null,
  food_snapshot jsonb not null,
  grams numeric(8,2) not null check (grams > 0 and grams <= 10000),
  nutrients jsonb not null,
  created_at timestamptz not null default now()
);

create table public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.strength_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  template_name text not null,
  exercises jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create table public.cardio_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  type text not null,
  duration_min integer not null check (duration_min >= 0 and duration_min <= 1440),
  distance_km numeric(8,2) check (distance_km is null or distance_km >= 0),
  calories integer check (calories is null or calories >= 0),
  created_at timestamptz not null default now()
);

create table public.step_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  steps integer not null check (steps >= 0 and steps <= 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create table public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  weight_kg numeric(5,2) check (weight_kg is null or weight_kg between 30 and 300),
  waist_cm numeric(5,2) check (waist_cm is null or waist_cm between 30 and 250),
  body_fat_percent numeric(4,1) check (body_fat_percent is null or body_fat_percent between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  label text not null default 'Progress',
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index meal_entries_user_date_idx on public.meal_entries(user_id, log_date desc);
create index strength_sessions_user_date_idx on public.strength_sessions(user_id, log_date desc);
create index cardio_entries_user_date_idx on public.cardio_entries(user_id, log_date desc);
create index step_entries_user_date_idx on public.step_entries(user_id, log_date desc);
create index body_metrics_user_date_idx on public.body_metrics(user_id, log_date desc);
create index progress_photos_user_date_idx on public.progress_photos(user_id, log_date desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create trigger saved_meals_set_updated_at before update on public.saved_meals
for each row execute function public.set_updated_at();

create trigger strength_sessions_set_updated_at before update on public.strength_sessions
for each row execute function public.set_updated_at();

create trigger step_entries_set_updated_at before update on public.step_entries
for each row execute function public.set_updated_at();

create trigger body_metrics_set_updated_at before update on public.body_metrics
for each row execute function public.set_updated_at();

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(split_part(new.email, '@', 1), 'You'))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function app_private.handle_new_user() from public;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function app_private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.meal_entries enable row level security;
alter table public.saved_meals enable row level security;
alter table public.strength_sessions enable row level security;
alter table public.cardio_entries enable row level security;
alter table public.step_entries enable row level security;
alter table public.body_metrics enable row level security;
alter table public.progress_photos enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.meal_entries to authenticated;
grant select, insert, update, delete on public.saved_meals to authenticated;
grant select, insert, update, delete on public.strength_sessions to authenticated;
grant select, insert, update, delete on public.cardio_entries to authenticated;
grant select, insert, update, delete on public.step_entries to authenticated;
grant select, insert, update, delete on public.body_metrics to authenticated;
grant select, insert, update, delete on public.progress_photos to authenticated;

create policy "Users can select own profile" on public.profiles
for select to authenticated
using ((select auth.uid()) = id);

create policy "Users can insert own profile" on public.profiles
for insert to authenticated
with check ((select auth.uid()) = id);

create policy "Users can update own profile" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "Users can delete own profile" on public.profiles
for delete to authenticated
using ((select auth.uid()) = id);

create policy "Users can select own meal entries" on public.meal_entries
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own meal entries" on public.meal_entries
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own meal entries" on public.meal_entries
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own meal entries" on public.meal_entries
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can select own saved meals" on public.saved_meals
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own saved meals" on public.saved_meals
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own saved meals" on public.saved_meals
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own saved meals" on public.saved_meals
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can select own strength sessions" on public.strength_sessions
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own strength sessions" on public.strength_sessions
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own strength sessions" on public.strength_sessions
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own strength sessions" on public.strength_sessions
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can select own cardio entries" on public.cardio_entries
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own cardio entries" on public.cardio_entries
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own cardio entries" on public.cardio_entries
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own cardio entries" on public.cardio_entries
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can select own step entries" on public.step_entries
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own step entries" on public.step_entries
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own step entries" on public.step_entries
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own step entries" on public.step_entries
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can select own body metrics" on public.body_metrics
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own body metrics" on public.body_metrics
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own body metrics" on public.body_metrics
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own body metrics" on public.body_metrics
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can select own progress photos" on public.progress_photos
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own progress photos" on public.progress_photos
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own progress photos" on public.progress_photos
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own progress photos" on public.progress_photos
for delete to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = excluded.public;

create policy "Users can read own progress photo objects" on storage.objects
for select to authenticated
using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can upload own progress photo objects" on storage.objects
for insert to authenticated
with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can update own progress photo objects" on storage.objects
for update to authenticated
using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can delete own progress photo objects" on storage.objects
for delete to authenticated
using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
