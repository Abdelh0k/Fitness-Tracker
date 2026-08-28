alter table public.cardio_entries
  add column machine text,
  add column speed_kmh numeric(5,2),
  add column incline_percent numeric(4,1),
  add column watts numeric(6,1),
  add column step_rate numeric(5,1);
