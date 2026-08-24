create type public.experience_level as enum ('new', 'returning', 'intermediate', 'advanced');
create type public.weekly_pace as enum ('easy', 'steady', 'fast');

alter table public.profiles
  add column target_weight_kg numeric(5,2) check (target_weight_kg between 30 and 300),
  add column experience_level public.experience_level,
  add column weekly_pace public.weekly_pace not null default 'steady',
  add column cardio_days_per_week integer not null default 2 check (cardio_days_per_week between 0 and 14),
  add column onboarded_at timestamptz;

-- Deliberately no backfill: onboarding shipped alongside these columns, so nobody has
-- actually been through it yet. Leaving onboarded_at null sends existing accounts
-- through it once, which is the point.
