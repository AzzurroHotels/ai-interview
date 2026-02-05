-- supabase/migrations/001_init.sql
-- Azzurro AI Interview Portal schema + RLS + Storage policies

create extension if not exists pgcrypto;

-- Main interview session
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

  -- lightweight integrity signals
  visibility_hidden_count int not null default 0,
  practice_rerecords int not null default 0
);

-- Per-question answers (stored clips)
create table if not exists public.interview_answers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  interview_id uuid not null references public.interviews(id) on delete cascade,
  question_index int not null,
  question_text text not null,
  followup_text text,

  storage_path text not null,
  mime_type text not null default 'video/webm',
  duration_seconds int
);

create index if not exists idx_interview_answers_interview_id on public.interview_answers(interview_id);
create index if not exists idx_interview_answers_question_index on public.interview_answers(interview_id, question_index);

-- ------------------------
-- Row Level Security (RLS)
-- ------------------------
alter table public.interviews enable row level security;
alter table public.interview_answers enable row level security;

-- Candidates (anon) can insert their own submissions. No read access.
drop policy if exists "anon_insert_interviews" on public.interviews;
create policy "anon_insert_interviews"
on public.interviews
for insert
to anon
with check (true);

drop policy if exists "anon_insert_answers" on public.interview_answers;
create policy "anon_insert_answers"
on public.interview_answers
for insert
to anon
with check (true);

-- Only authenticated/service should read; by default no select policy is granted to anon.
-- You can add staff auth policies later if you build an admin portal.

-- ------------------------
-- Storage bucket policies
-- ------------------------
-- Create a bucket named "interviews" in Supabase Storage (recommended: PRIVATE).
-- These policies allow ANON uploads only, and do not allow ANON reads.

-- Enable RLS on storage.objects (usually already enabled)
alter table storage.objects enable row level security;

-- Allow anon to upload (insert) objects into bucket 'interviews'
drop policy if exists "anon_upload_interviews_bucket" on storage.objects;
create policy "anon_upload_interviews_bucket"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'interviews'
);

-- Allow anon to update their object? (not needed; uploads are non-upsert)
-- No anon select policy is created (keeps recordings private).
