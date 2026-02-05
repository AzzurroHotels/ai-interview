-- Enable required extension
create extension if not exists pgcrypto;

-- =========================
-- Interviews table
-- =========================
create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  candidate_name text not null,
  candidate_email text,
  role text not null,

  mode text not null default 'video',
  status text not null default 'submitted',

  total_questions int not null default 0,

  user_agent text,
  device_hint text,

  -- IMPORTANT: this column was missing
  practice_records int not null default 0,

  visibility_hidden_count int not null default 0
);

-- =========================
-- Interview answers table
-- =========================
create table if not exists public.interview_answers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  interview_id uuid not null
    references public.interviews(id)
    on delete cascade,

  question_index int not null,
  question_text text not null,
  followup_text text,

  storage_path text not null,
  duration_seconds int,
  mime_type text
);

-- =========================
-- RLS
-- =========================
alter table public.interviews enable row level security;
alter table public.interview_answers enable row level security;

-- Allow anon inserts (public interview submission)
create policy "anon can insert interviews"
on public.interviews
for insert
to anon
with check (true);

create policy "anon can insert interview answers"
on public.interview_answers
for insert
to anon
with check (true);

-- Allow anon reads if needed (optional but helpful)
create policy "anon can read interviews"
on public.interviews
for select
to anon
using (true);

create policy "anon can read interview answers"
on public.interview_answers
for select
to anon
using (true);
