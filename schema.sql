-- 30 Days Together — Supabase schema
-- Paste this into Supabase → SQL Editor → Run

-- =========================================================
-- 1. Tables
-- =========================================================

-- One row per shared challenge (you'll have one for now)
create table if not exists challenges (
  id              uuid primary key default gen_random_uuid(),
  name            text not null default '30 Days Together',
  start_date      date,                       -- null until set in onboarding
  total_days      int  not null default 30,
  season          int  not null default 1,
  season_name     text not null default 'A quest for two',
  created_at      timestamptz not null default now()
);

-- Per-day editable meal slots per member (breakfast/lunch/dinner/snack)
create table if not exists meals (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references members(id) on delete cascade,
  day             int  not null check (day between 1 and 60),
  slot            text not null,              -- 'breakfast' | 'lunch' | 'dinner' | 'snack'
  label           text not null,
  done            boolean not null default false,
  position        int  not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists meals_member_day_idx on meals(member_id, day);

-- Saireen and Kaisu — two members per challenge
create table if not exists members (
  id              uuid primary key default gen_random_uuid(),
  challenge_id    uuid not null references challenges(id) on delete cascade,
  name            text not null,           -- 'Saireen' or 'Kaisu'
  emoji           text default '🌸',
  color           text default '#ff6fa3',
  created_at      timestamptz not null default now(),
  unique (challenge_id, name)
);

-- Editable per-day task list per member.
-- e.g. for Saireen day 3 → ["Pull workout", "Home food", "8 glasses water"]
create table if not exists tasks (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references members(id) on delete cascade,
  day             int  not null check (day between 1 and 60),
  label           text not null,
  position        int  not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists tasks_member_day_idx on tasks(member_id, day);

-- One check-in row per member per day.
-- Upsert by (member_id, day).
create table if not exists checkins (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references members(id) on delete cascade,
  day             int  not null check (day between 1 and 60),
  workout_done    boolean not null default false,
  home_food_done  boolean not null default false,
  ate_out         boolean not null default false,
  mood            int     check (mood between 1 and 5),
  notes           text    default '',
  task_state      jsonb   not null default '{}'::jsonb,  -- { taskId: true/false }
  completed_at    timestamptz,
  updated_at      timestamptz not null default now(),
  unique (member_id, day)
);

-- Nudges (lightweight chat / pokes between members)
create table if not exists nudges (
  id              uuid primary key default gen_random_uuid(),
  challenge_id    uuid not null references challenges(id) on delete cascade,
  from_member_id  uuid not null references members(id) on delete cascade,
  to_member_id    uuid not null references members(id) on delete cascade,
  day             int,
  message         text not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists nudges_challenge_idx on nudges(challenge_id, created_at desc);

-- =========================================================
-- 2. Auto-update updated_at on checkins
-- =========================================================
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

drop trigger if exists checkins_updated_at on checkins;
create trigger checkins_updated_at
  before update on checkins
  for each row execute function set_updated_at();

-- =========================================================
-- 3. Row Level Security
-- =========================================================
-- Simplest setup for a private 2-person app:
-- enable RLS, allow anon read+write to everything.
-- For tighter security later, replace with auth.uid()-based policies.

alter table challenges enable row level security;
alter table members    enable row level security;
alter table tasks      enable row level security;
alter table checkins   enable row level security;
alter table nudges     enable row level security;
alter table meals      enable row level security;

drop policy if exists "open" on challenges;
drop policy if exists "open" on members;
drop policy if exists "open" on tasks;
drop policy if exists "open" on checkins;
drop policy if exists "open" on nudges;
drop policy if exists "open" on meals;

create policy "open" on challenges for all using (true) with check (true);
create policy "open" on members    for all using (true) with check (true);
create policy "open" on tasks      for all using (true) with check (true);
create policy "open" on checkins   for all using (true) with check (true);
create policy "open" on nudges     for all using (true) with check (true);
create policy "open" on meals      for all using (true) with check (true);

-- =========================================================
-- 4. Seed: one challenge + two members
-- =========================================================
do $$
declare
  cid uuid;
begin
  if not exists (select 1 from challenges) then
    insert into challenges (name, start_date) values ('30 Days Together', current_date) returning id into cid;
    insert into members (challenge_id, name, emoji, color) values
      (cid, 'Saireen', '🌸', '#ff6fa3'),
      (cid, 'Kaisu',   '⚡', '#7c5cff');
  end if;
end $$;
