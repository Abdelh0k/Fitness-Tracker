create table public.training_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  days jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index training_programs_user_updated_idx on public.training_programs(user_id, updated_at desc);

create trigger training_programs_set_updated_at before update on public.training_programs
for each row execute function public.set_updated_at();

alter table public.training_programs enable row level security;
grant select, insert, update, delete on public.training_programs to authenticated;

create policy "Users can select own training programs" on public.training_programs
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own training programs" on public.training_programs
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own training programs" on public.training_programs
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own training programs" on public.training_programs
for delete to authenticated
using ((select auth.uid()) = user_id);
