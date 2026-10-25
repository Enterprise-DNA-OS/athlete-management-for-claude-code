-- Athlete Management for Claude Code: the schema.
-- Squads, athletes and staff; sessions with each athlete's minutes and RPE (session load);
-- the daily wellness questionnaire; injuries with their return-to-play stages and clearance;
-- testing batteries; staff safety checks; notes. Plain Postgres: runs on Postgres, Supabase
-- and the embedded PGlite the same way.

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- One row of settings: the thresholds the attention list and the rules use.
create table settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'Your Organisation',
  timezone text not null default 'Pacific/Auckland',
  acwr_high numeric(4,2) not null default 1.50,          -- acute:chronic workload ratio above this is a spike
  acwr_low numeric(4,2) not null default 0.80,           -- below this an available athlete is under-loaded
  week_change_pct int not null default 15,               -- week-on-week load jump worth a look
  wellness_drop int not null default 4,                  -- points below the athlete's own 28-day average
  sleep_min numeric(3,1) not null default 6.0,           -- hours
  community_min_days int not null default 21,            -- concussion: days from injury (day 0) to competition
  symptom_free_days int not null default 14,             -- concussion: symptom-free days before contact training
  elite_symptom_free_days int not null default 10,       -- concussion: adults 19+ with daily medical cover
  concussion_review_count int not null default 3,        -- this many in 12 months triggers a season review
  updated_at timestamptz not null default now()
);
create trigger settings_touch before update on settings for each row execute function touch_updated_at();
insert into settings (id) values (1) on conflict do nothing;

create table staff (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  role text not null check (role in ('doctor', 'physio', 'sc', 'coach', 'analyst', 'manager', 'nutrition')),
  email text,
  safety_check text,                     -- e.g. 'NZ Police vet', 'NSW WWCC'
  safety_check_expires date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger staff_touch before update on staff for each row execute function touch_updated_at();

create table squads (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sport text not null,
  level text not null check (level in ('elite', 'community', 'youth')),
  daily_medical boolean not null default false,   -- a doctor or physio with the squad every day
  created_at timestamptz not null default now()
);

create table squad_staff (
  squad_id uuid not null references squads(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  primary key (squad_id, staff_id)
);

create table athletes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  first_name text not null,
  last_name text not null,
  squad_id uuid references squads(id),
  position text,
  dob date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  consent_on date,                        -- written consent to collect health information
  phone text,
  email text,
  external_id text unique,                -- the id in the system it came from (Smartabase username)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger athletes_touch before update on athletes for each row execute function touch_updated_at();

create table sessions (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references squads(id),
  session_date date not null,
  kind text not null check (kind in ('field', 'gym', 'match', 'conditioning', 'recovery', 'skills')),
  title text not null,
  contact boolean not null default false,
  planned_minutes int,
  created_at timestamptz not null default now(),
  unique (squad_id, session_date, title)
);

-- Session RPE: minutes x rating of perceived exertion (0 to 10) = arbitrary units of load.
create table session_loads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  athlete_id uuid not null references athletes(id) on delete cascade,
  minutes int not null check (minutes >= 0),
  rpe numeric(3,1) not null check (rpe between 0 and 10),
  load numeric(7,1) generated always as (minutes * rpe) stored,
  distance_m int,
  hsr_m int,                               -- high-speed running metres, when GPS is worn
  created_at timestamptz not null default now(),
  unique (session_id, athlete_id)
);

-- The morning questionnaire. Every item 1 to 5, 5 is best (well rested, fresh, no soreness, calm, good mood).
create table wellness (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  entry_date date not null,
  sleep_hours numeric(3,1),
  sleep_quality smallint not null check (sleep_quality between 1 and 5),
  fatigue smallint not null check (fatigue between 1 and 5),
  soreness smallint not null check (soreness between 1 and 5),
  stress smallint not null check (stress between 1 and 5),
  mood smallint not null check (mood between 1 and 5),
  score smallint generated always as (sleep_quality + fatigue + soreness + stress + mood) stored,
  comment text,
  created_at timestamptz not null default now(),
  unique (athlete_id, entry_date)
);

create table injuries (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  athlete_id uuid not null references athletes(id) on delete cascade,
  reported_on date not null,
  body_area text,
  side text check (side in ('left', 'right', 'both', 'n/a')),
  kind text not null check (kind in ('concussion', 'muscle', 'ligament', 'tendon', 'bone', 'joint', 'illness', 'other')),
  mechanism text check (mechanism in ('contact', 'non-contact', 'overuse', 'illness')),
  activity text check (activity in ('match', 'training', 'other')),
  diagnosis text,
  status text not null default 'out' check (status in ('out', 'modified', 'cleared')),
  expected_return date,
  symptoms_resolved_on date,               -- concussion: the first day free of symptoms at rest
  cleared_on date,
  cleared_by uuid references staff(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger injuries_touch before update on injuries for each row execute function touch_updated_at();

-- Graded return to sport, one row per stage reached. Stage names follow the AIS and ACC frameworks.
create table rtp_stages (
  id uuid primary key default gen_random_uuid(),
  injury_id uuid not null references injuries(id) on delete cascade,
  stage int not null check (stage between 1 and 6),
  name text not null,
  completed_on date not null,
  signed_by uuid references staff(id),
  notes text,
  unique (injury_id, stage)
);

create table tests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  unit text not null,
  better text not null check (better in ('higher', 'lower'))
);

create table test_results (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  test_id uuid not null references tests(id),
  tested_on date not null,
  value numeric(9,2) not null,
  unique (athlete_id, test_id, tested_on)
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  staff_id uuid references staff(id),
  noted_on date not null default current_date,
  body text not null,
  created_at timestamptz not null default now()
);

create index on session_loads (athlete_id);
create index on sessions (session_date);
create index on wellness (entry_date);
create index on injuries (athlete_id, status);
create index on test_results (athlete_id, test_id, tested_on);

-- ---------------------------------------------------------------- views

create view athlete_list as
  select a.*, a.first_name || ' ' || a.last_name as name, s.code as squad, s.name as squad_name, s.level, s.daily_medical,
         date_part('year', age(current_date, a.dob))::int as age
  from athletes a left join squads s on s.id = a.squad_id;

create view daily_load as
  select l.athlete_id, s.session_date as day, sum(l.load) as load, sum(l.minutes) as minutes, count(*) as sessions
  from session_loads l join sessions s on s.id = l.session_id
  group by l.athlete_id, s.session_date;

-- Today's status for each athlete: worst open injury first.
create view availability as
  select a.id as athlete_id, a.code, a.name, a.squad, a.position,
         coalesce(i.status, 'available') as status, i.number as injury, i.kind, i.diagnosis, i.reported_on, i.expected_return
  from athlete_list a
  left join lateral (
    select * from injuries j where j.athlete_id = a.id and j.status in ('out', 'modified')
    order by case j.status when 'out' then 0 else 1 end, j.reported_on desc limit 1) i on true
  where a.status = 'active';

-- Acute (7 days) and chronic (28-day weekly average) load, the ratio, and the week-on-week change.
create view load_status as
  select a.id as athlete_id, a.code, a.name, a.squad, v.status,
         coalesce(sum(d.load) filter (where d.day > current_date - 7), 0) as acute,
         round(coalesce(sum(d.load) filter (where d.day > current_date - 28), 0) / 4.0, 1) as chronic,
         coalesce(sum(d.load) filter (where d.day > current_date - 14 and d.day <= current_date - 7), 0) as last_week,
         coalesce(sum(d.sessions) filter (where d.day > current_date - 7), 0) as sessions_7d,
         round(coalesce(sum(d.load) filter (where d.day > current_date - 7), 0)
               / nullif(coalesce(sum(d.load) filter (where d.day > current_date - 28), 0) / 4.0, 0), 2) as acwr
  from athlete_list a
  join availability v on v.athlete_id = a.id
  left join daily_load d on d.athlete_id = a.id and d.day > current_date - 28 and d.day <= current_date
  where a.status = 'active'
  group by a.id, a.code, a.name, a.squad, v.status;

-- Today's questionnaire against the athlete's own 28-day average.
create view wellness_today as
  select a.id as athlete_id, a.code, a.name, a.squad,
         w.id is not null as submitted, w.score, w.sleep_hours, w.sleep_quality, w.fatigue, w.soreness, w.stress, w.mood, w.comment,
         b.baseline, b.entries,
         case when w.id is not null and b.baseline is not null then round(w.score - b.baseline, 1) end as vs_baseline
  from athlete_list a
  left join wellness w on w.athlete_id = a.id and w.entry_date = current_date
  left join lateral (select round(avg(x.score), 1) as baseline, count(*) as entries from wellness x
                     where x.athlete_id = a.id and x.entry_date between current_date - 28 and current_date - 1) b on true
  where a.status = 'active';

create view injury_register as
  select i.*, a.code as athlete_code, a.name as athlete, a.squad, a.age,
         coalesce(i.cleared_on, current_date) - i.reported_on as days_out,
         (select max(r.stage) from rtp_stages r where r.injury_id = i.id) as stage_reached,
         st.name as cleared_by_name, st.role as cleared_by_role
  from injuries i join athlete_list a on a.id = i.athlete_id left join staff st on st.id = i.cleared_by;

-- Every concussion with the dates it may return to contact training and to competition.
-- Adults 19 and over with daily medical cover: 10 symptom-free days (AIS 2024, elite).
-- Everyone else: 14 symptom-free days before contact, and not before day 21 for competition (ACC, AIS 2024).
create view concussion_status as
  with c as (
    select r.*, (r.age >= 19 and a.daily_medical) as elite_path,
           case when r.age >= 19 and a.daily_medical then st.elite_symptom_free_days else st.symptom_free_days end as free_days_needed,
           st.community_min_days
    from injury_register r join athlete_list a on a.id = r.athlete_id cross join settings st
    where r.kind = 'concussion'
  ), d as (
    select c.*,
           c.symptoms_resolved_on + c.free_days_needed as contact_ok_from,
           case when c.elite_path then c.symptoms_resolved_on + c.free_days_needed
                else greatest(c.reported_on + c.community_min_days, c.symptoms_resolved_on + c.free_days_needed) end as competition_ok_from
    from c
  )
  select d.*,
         coalesce(d.cleared_by_role = 'doctor', false) as doctor_cleared,
         (select count(*) from session_loads l join sessions s on s.id = l.session_id
           where l.athlete_id = d.athlete_id and s.contact and s.kind <> 'match' and s.session_date > d.reported_on
             and (d.contact_ok_from is null or s.session_date < d.contact_ok_from)) as contact_sessions_early,
         (select count(*) from session_loads l join sessions s on s.id = l.session_id
           where l.athlete_id = d.athlete_id and s.kind = 'match' and s.session_date > d.reported_on
             and (d.competition_ok_from is null or s.session_date < d.competition_ok_from
                  or d.cleared_on is null or s.session_date < d.cleared_on)) as matches_early,
         (select count(*) from injuries x where x.athlete_id = d.athlete_id and x.kind = 'concussion'
             and x.reported_on > d.reported_on - 365 and x.reported_on <= d.reported_on) as concussions_12m
  from d;

-- Latest and previous result for each athlete and test, with the squad's smallest worthwhile change
-- (0.2 x the between-athlete standard deviation of the latest results).
create view test_changes as
  with ranked as (
    select r.*, row_number() over (partition by r.athlete_id, r.test_id order by r.tested_on desc) as rn
    from test_results r
  ), latest as (
    select l.athlete_id, l.test_id, l.tested_on, l.value, p.value as previous, p.tested_on as previous_on
    from ranked l left join ranked p on p.athlete_id = l.athlete_id and p.test_id = l.test_id and p.rn = 2
    where l.rn = 1
  ), spread as (
    select l.test_id, a.squad_id, stddev_samp(l.value) as sd, avg(l.value) as squad_avg
    from latest l join athletes a on a.id = l.athlete_id group by l.test_id, a.squad_id
  )
  select a.code, a.name, a.squad, t.code as test, t.name as test_name, t.unit, t.better,
         l.athlete_id, l.tested_on, l.value, l.previous_on, l.previous,
         round(l.value - l.previous, 2) as change,
         round(s.squad_avg, 2) as squad_avg,
         round(0.2 * s.sd, 2) as swc,
         case when l.previous is null or s.sd is null then null
              when abs(l.value - l.previous) < 0.2 * s.sd then 'no real change'
              when (l.value > l.previous) = (t.better = 'higher') then 'better'
              else 'worse' end as verdict
  from latest l join tests t on t.id = l.test_id join athlete_list a on a.id = l.athlete_id
  left join spread s on s.test_id = l.test_id and s.squad_id = a.squad_id;

-- Staff who work with a squad that has an active athlete under 18.
create view staff_with_minors as
  select distinct st.*, sq.code as squad
  from staff st join squad_staff ss on ss.staff_id = st.id join squads sq on sq.id = ss.squad_id
  where st.active and exists (select 1 from athlete_list a where a.squad_id = sq.id and a.status = 'active' and a.age < 18);

-- Health information stays private: no public access when this runs on a hosted database.
do $$
declare t text;
begin
  foreach t in array array['settings','staff','squads','squad_staff','athletes','sessions','session_loads','wellness','injuries','rtp_stages','tests','test_results','notes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from public', t);
  end loop;
end $$;
