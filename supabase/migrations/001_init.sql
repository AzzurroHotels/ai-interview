-- Enable UUID generation
create extension if not exists "pgcrypto";

-- =========================
-- INTERVIEWS TABLE
-- =========================
drop table if exists public.interview_answers cascade;
drop table if exists public.interviews cascade;

create table public.interviews (
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

  -- ✅ REQUIRED BY YOUR APP
  visibility_hidden_count int not null default 0,
  practice_records int not null default 0
);

-- =========================
-- INTERVIEW ANSWERS TABLE
-- =========================
create table public.interview_answers (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade,

  question_index int not null,
  question_text text not null,
  followup_text text,

  storage_path text not null,
  duration_seconds int,
  mime_type text,

  created_at timestamptz not null default now()
);

-- =========================
-- INDEXES
-- =========================
create index interview_answers_interview_id_idx
  on public.interview_answers(interview_id);

-- =========================
-- ROW LEVEL SECURITY
-- =========================
alter table public.interviews enable row level security;
alter table public.interview_answers enable row level security;

-- Allow anonymous inserts (your public interview form)
create policy "anon_insert_interviews"
on public.interviews
for insert
to anon
with check (true);

create policy "anon_insert_answers"
on public.interview_answers
for insert
to anon
with check (true);

-- Allow anon read (used by edge functions)
create policy "anon_select_interviews"
on public.interviews
for select
to anon
using (true);

create policy "anon_select_answers"
on public.interview_answers
for select
to anon
using (true);
