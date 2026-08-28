alter table public.meal_entries
  add column meal_session_id uuid;

create index meal_entries_session_idx on public.meal_entries(user_id, meal_session_id);
