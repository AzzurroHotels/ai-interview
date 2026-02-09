-- ============================================
-- Azzurro AI Interview Portal
-- FINAL CLEAN DATABASE SCHEMA
-- ============================================

-- Required extension
create extension if not exists pgcrypto;

-- --------------------------------------------
-- Drop existing tables (safe reset)
-- --------------------------------------------
drop table if exists public.interview_answers cascade;
drop table if exists public.interviews cascade;

-- --------------------------------------------
-- INTERVIEWS TABLE
-- --------------------------------------------
create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Candidate info
  candidate_name text not null,
  candidate_email text,
  role text not null,

  -- Interview config
  mode text not null default 'video',
  status text not null default 'submitted',
  total_questions int not null default 0,

  -- Client / device info
  user_agent text,
  device_hint text,

  -- Flags used by app.js (IMPORTANT)
  visibility_hidden_count int not null default 0,
  practice_rerecords int not null default 0,

  -- Practice recording storage
  practice_storage_path text,
  practice_mime_type text,
  practice_duration_seconds int
);

-- --------------------------------------------
-- INTERVIEW ANSWERS TABLE
-- --------------------------------------------
create table public.interview_answers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  interview_id uuid not null references public.interviews(id) on delete cascade,

  question_index int not null,
  question_text text not null,
  followup_text text,

  storage_path text not null,
  mime_type text,
  duration_seconds int
);

-- --------------------------------------------
-- ROW LEVEL SECURITY
-- --------------------------------------------
alter table public.interviews enable row level security;
alter table public.interview_answers enable row level security;

-- --------------------------------------------
-- POLICIES — Interviews
-- --------------------------------------------

-- Allow anyone to insert interview records
create policy "anon can insert interviews"
on public.interviews
for insert
to public
with check (true);

-- Allow anyone to read interviews (needed by app)
create policy "anon can read interviews"
on public.interviews
for select
to public
using (true);

-- --------------------------------------------
-- POLICIES — Interview Answers
-- --------------------------------------------

-- Allow anyone to insert answers
create policy "anon can insert interview answers"
on public.interview_answers
for insert
to public
with check (true);

-- Allow anyone to read answers
create policy "anon can read interview answers"
on public.interview_answers
for select
to public
using (true);
