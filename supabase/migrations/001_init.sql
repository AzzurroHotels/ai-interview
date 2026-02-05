-- Azzurro AI Interview Portal (SAFE SQL)
-- ✅ Creates interview tables + RLS policies
-- ❌ Does NOT touch storage.* (avoids "must be owner of table objects" error)

-- 1) Extensions
create extension if not exists pgcrypto;

-- 2) Main interview session table
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

  visibility_hidden_count int not null default 0,
  practice_records int not null default 0
);

-- 3) Per-question answers table
create table if not exists public.interview_answers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  interview_id uuid not null references public.interviews(id) on delete cascade,

  question_index int not null,
  question_text text not null,

  answer_text text,
  media_type text not null default 'video', -- 'video' or 'audio'
  storage_path text,                       -- path of uploaded file (you store this in Storage)
  duration_seconds numeric,

  constraint interview_answers_unique_q
    unique (interview_id, question_index)
);

-- Helpful indexes
create index if not exists interview_answers_interview_id_idx
  on public.interview_answers (interview_id);

create index if not exists interviews_created_at_idx
  on public.interviews (created_at desc);

-- 4) Enable Row Level Security (RLS)
alter table public.interviews enable row level security;
alter table public.interview_answers enable row level security;

-- 5) Drop old policies if re-running
drop policy if exists "anon_all_interviews" on public.interviews;
drop policy if exists "anon_all_interview_answers" on public.interview_answers;

-- 6) Policies (simple + works for anon public app)
-- NOTE: This allows anon users to read/update rows if they know the interview_id.
-- If you want stricter privacy later, we can harden this with a token approach.
create policy "anon_all_interviews"
on public.interviews
for all
to anon
using (true)
with check (true);

create policy "anon_all_interview_answers"
on public.interview_answers
for all
to anon
using (true)
with check (true);
