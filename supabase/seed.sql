-- Demo data: Southern Lakes Rugby, a fictional provincial union with three squads.
--   SEN  the men's squad: elite, a doctor or physio with them every day
--   WMN  the women's squad: community level, no daily medical cover
--   ACAD the under-18 academy: youth
-- Six weeks of sessions with minutes and RPE, four weeks of morning wellness, injuries with their
-- return-to-play stages, two rounds of testing and staff safety checks. Every date is relative to
-- today, so the demo always reads as "this week". Deliberately wrong on purpose: a concussed player
-- back in contact and a match too early and cleared by a physio, two athletes with no health consent,
-- two academy staff with no current safety check, a stage done twice in one day, a third concussion
-- in a year, an injury with no mechanism, a load spike after a long injury, three wellness forms missing.
-- Every insert skips what is already there, so running it twice is harmless.

create or replace function pg_temp.h(t text) returns int language sql immutable as
  $$ select abs(('x' || substr(md5(t), 1, 8))::bit(32)::int) $$;

update settings set business_name = 'Southern Lakes Rugby' where id = 1 and business_name = 'Your Organisation';

insert into staff (code, name, role, email, safety_check, safety_check_expires) values
  ('DR1', 'Dr Aroha Reid', 'doctor', 'aroha.reid@example.org', 'NZ Police vet', current_date + 400),
  ('PH1', 'Nina Marsh', 'physio', 'nina.marsh@example.org', 'NZ Police vet', current_date + 200),
  ('PH2', 'Callum Ruawai', 'physio', 'callum.ruawai@example.org', 'NZ Police vet', current_date + 300),
  ('SC1', 'Jess Okafor', 'sc', 'jess.okafor@example.org', null, null),
  ('SC2', 'Dan Hirini', 'sc', 'dan.hirini@example.org', null, null),
  ('CO1', 'Mark Fenwick', 'coach', 'mark.fenwick@example.org', null, null),
  ('CO2', 'Tia Paki', 'coach', 'tia.paki@example.org', 'NZ Police vet', current_date + 90),
  ('CO3', 'Tom Fale', 'coach', 'tom.fale@example.org', 'NZ Police vet', current_date - 20)
on conflict (code) do nothing;

insert into squads (code, name, sport, level, daily_medical) values
  ('SEN', 'Southern Lakes men', 'Rugby union', 'elite', true),
  ('WMN', 'Southern Lakes women', 'Rugby union', 'community', false),
  ('ACAD', 'Under-18 academy', 'Rugby union', 'youth', false)
on conflict (code) do nothing;

insert into squad_staff (squad_id, staff_id)
select q.id, s.id from (values
  ('SEN', 'DR1'), ('SEN', 'PH1'), ('SEN', 'SC1'), ('SEN', 'CO1'),
  ('WMN', 'DR1'), ('WMN', 'PH1'), ('WMN', 'CO2'),
  ('ACAD', 'DR1'), ('ACAD', 'PH2'), ('ACAD', 'SC2'), ('ACAD', 'CO3')) v(sq, st)
join squads q on q.code = v.sq join staff s on s.code = v.st
on conflict do nothing;

insert into athletes (code, first_name, last_name, squad_id, position, dob, consent_on, external_id)
select v.code, v.first, v.last, q.id, v.pos, current_date - (v.age * 365 + 100), case when v.consent then current_date - 150 end, lower(v.first || '.' || v.last)
from (values
  ('A001', 'Tane', 'Walker', 'SEN', 'Prop', 27, true),
  ('A002', 'Lachlan', 'Price', 'SEN', 'Hooker', 24, true),
  ('A003', 'Ioane', 'Sapolu', 'SEN', 'Lock', 26, true),
  ('A004', 'Will', 'Henare', 'SEN', 'Flanker', 23, true),
  ('A005', 'Ben', 'Carver', 'SEN', 'Number 8', 29, true),
  ('A006', 'Rory', 'Ngata', 'SEN', 'Halfback', 22, true),
  ('A007', 'Finn', 'Mathers', 'SEN', 'First five', 25, true),
  ('A008', 'Kahu', 'Rangi', 'SEN', 'Centre', 28, true),
  ('A009', 'Jack', 'Tamati', 'SEN', 'Wing', 21, true),
  ('A010', 'Sione', 'Latu', 'SEN', 'Fullback', 30, true),
  ('W01', 'Mere', 'Tipene', 'WMN', 'Prop', 24, true),
  ('W02', 'Grace', 'Halliday', 'WMN', 'Lock', 27, true),
  ('W03', 'Ana', 'Fifita', 'WMN', 'Flanker', 22, true),
  ('W04', 'Kate', 'Brennan', 'WMN', 'Halfback', 26, true),
  ('W05', 'Holly', 'Barnes', 'WMN', 'Centre', 18, true),
  ('W06', 'Ruby', 'Kingi', 'WMN', 'Wing', 29, true),
  ('W07', 'Lucy', 'Arnold', 'WMN', 'Fullback', 20, false),
  ('U01', 'Nikau', 'Reihana', 'ACAD', 'Prop', 17, true),
  ('U02', 'Tom', 'Whitfield', 'ACAD', 'Lock', 16, true),
  ('U03', 'Eli', 'Moana', 'ACAD', 'Flanker', 17, true),
  ('U04', 'Zac', 'Pearce', 'ACAD', 'Halfback', 16, false),
  ('U05', 'Hemi', 'Paewai', 'ACAD', 'Centre', 17, true),
  ('U06', 'Leo', 'Grant', 'ACAD', 'Wing', 15, true)) v(code, first, last, sq, pos, age, consent)
join squads q on q.code = v.sq
on conflict (code) do nothing;

-- Injuries. k = days ago.
insert into injuries (number, athlete_id, reported_on, body_area, side, kind, mechanism, activity, diagnosis, status, expected_return, symptoms_resolved_on, cleared_on, cleared_by, notes)
select v.number, a.id, current_date - v.k, v.area, v.side, v.kind, v.mech, v.act, v.dx, v.status,
       case when v.exp is not null then current_date + v.exp end,
       case when v.resolved is not null then current_date - v.resolved end,
       case when v.cleared is not null then current_date - v.cleared end, s.id, v.notes
from (values
  ('INJ-0001', 'A008', 330, 'Head', 'n/a', 'concussion', 'contact', 'match', 'Concussion, tackle', 'cleared', null, 326, 310, 'DR1', null),
  ('INJ-0002', 'A008', 200, 'Head', 'n/a', 'concussion', 'contact', 'training', 'Concussion, ruck clean-out', 'cleared', null, 196, 188, 'DR1', null),
  ('INJ-0003', 'A003', 30, 'Thigh', 'left', 'muscle', 'non-contact', 'training', 'Grade 2 hamstring strain', 'cleared', null, null, 8, 'PH1', 'Cleared to full training. Build sprint volume back over two weeks.'),
  ('INJ-0004', 'U02', 29, 'Head', 'n/a', 'concussion', 'contact', 'match', 'Concussion, head knock in the tackle', 'cleared', null, 25, 8, 'DR1', null),
  ('INJ-0005', 'A008', 36, 'Head', 'n/a', 'concussion', 'contact', 'match', 'Concussion, collision', 'cleared', null, 34, 24, 'DR1', null),
  ('INJ-0006', 'W04', 15, 'Head', 'n/a', 'concussion', 'contact', 'match', 'Concussion, fell awkwardly in the tackle', 'cleared', null, 11, 6, 'PH1', 'Says she feels fine. Keen to play.'),
  ('INJ-0007', 'W06', 12, 'Ankle', 'right', 'ligament', null, 'training', 'Lateral ankle sprain', 'modified', 5, null, null, null, 'Taped. Straight-line running only.'),
  ('INJ-0008', 'A005', 8, 'Head', 'n/a', 'concussion', 'contact', 'match', 'Concussion, HIA failed', 'out', 9, 5, null, null, null),
  ('INJ-0009', 'A010', 8, 'Shoulder', 'right', 'joint', 'contact', 'match', 'AC joint sprain, grade 2', 'out', 20, null, null, null, null),
  ('INJ-0010', 'U05', 2, 'Systemic', 'n/a', 'illness', 'illness', 'other', 'Gastro bug', 'out', 2, null, null, null, 'Isolate from the squad until 48 hours clear.')
) v(number, code, k, area, side, kind, mech, act, dx, status, exp, resolved, cleared, cleared_by, notes)
join athletes a on a.code = v.code left join staff s on s.code = v.cleared_by
on conflict (number) do nothing;

insert into rtp_stages (injury_id, stage, name, completed_on, signed_by)
select i.id, v.stage, v.name, current_date - v.k, s.id
from (values
  ('INJ-0004', 1, 'Relative rest', 28, 'PH2'), ('INJ-0004', 2, 'Light activity', 24, 'PH2'), ('INJ-0004', 3, 'Aerobic and strength', 20, 'PH2'),
  ('INJ-0004', 4, 'Non-contact training', 15, 'PH2'), ('INJ-0004', 5, 'Full contact training', 11, 'DR1'), ('INJ-0004', 6, 'Return to competition', 8, 'DR1'),
  ('INJ-0005', 1, 'Relative rest', 35, 'PH1'), ('INJ-0005', 2, 'Light activity', 33, 'PH1'), ('INJ-0005', 3, 'Aerobic and strength', 33, 'PH1'),
  ('INJ-0005', 4, 'Non-contact training', 31, 'PH1'), ('INJ-0005', 5, 'Full contact training', 24, 'DR1'), ('INJ-0005', 6, 'Return to competition', 22, 'DR1'),
  ('INJ-0006', 1, 'Relative rest', 14, 'PH1'), ('INJ-0006', 2, 'Light activity', 12, 'PH1'), ('INJ-0006', 3, 'Aerobic and strength', 8, 'PH1'),
  ('INJ-0008', 1, 'Relative rest', 7, 'PH1'), ('INJ-0008', 2, 'Light activity', 5, 'PH1'), ('INJ-0008', 3, 'Aerobic and strength', 4, 'PH1'),
  ('INJ-0008', 4, 'Non-contact training', 2, 'PH1')
) v(number, stage, name, k, by_code)
join injuries i on i.number = v.number left join staff s on s.code = v.by_code
on conflict (injury_id, stage) do nothing;

-- Sessions for the last six weeks. The week repeats on days ago mod 7, so a match was always yesterday.
insert into sessions (squad_id, session_date, kind, title, contact, planned_minutes)
select q.id, current_date - k, p.kind, p.title, p.contact, p.minutes
from generate_series(1, 41) k
cross join (values
  ('SEN', 1, 'match', 'Match', true, 80), ('SEN', 2, 'recovery', 'Recovery', false, 30), ('SEN', 3, 'field', 'Contact field', true, 75),
  ('SEN', 4, 'gym', 'Gym: strength', false, 60), ('SEN', 5, 'field', 'Team run', false, 60), ('SEN', 6, 'gym', 'Gym: power', false, 50),
  ('WMN', 1, 'match', 'Match', true, 70), ('WMN', 3, 'field', 'Contact field', true, 90), ('WMN', 5, 'skills', 'Skills', false, 75),
  ('ACAD', 1, 'match', 'Match', true, 60), ('ACAD', 3, 'field', 'Contact field', true, 80), ('ACAD', 5, 'gym', 'Gym', false, 45)
) p(sq, dow, kind, title, contact, minutes)
join squads q on q.code = p.sq
where k % 7 = p.dow
on conflict (squad_id, session_date, title) do nothing;

-- Each athlete's minutes and RPE. Out injured: nothing. Modified: half the minutes, easier, no contact.
insert into session_loads (session_id, athlete_id, minutes, rpe, distance_m, hsr_m)
select s.id, a.id,
       case when m.modified then s.planned_minutes / 2
            when s.kind = 'match' and pg_temp.h(a.code || s.session_date) % 4 = 0 then 30
            else s.planned_minutes end as minutes,
       greatest(1, case s.kind when 'match' then 7 + pg_temp.h(a.code || s.session_date || 'r') % 3
                              when 'field' then (case when s.contact then 6 else 4 end) + pg_temp.h(a.code || s.session_date || 'r') % 3
                              when 'skills' then 5 + pg_temp.h(a.code || s.session_date || 'r') % 2
                              when 'gym' then 5 + pg_temp.h(a.code || s.session_date || 'r') % 3
                              else 2 + pg_temp.h(a.code || s.session_date || 'r') % 2 end - case when m.modified then 2 else 0 end),
       case when s.kind in ('match', 'field', 'skills') then s.planned_minutes * 75 + pg_temp.h(a.code || s.session_date || 'd') % 900 end,
       case when s.kind in ('match', 'field', 'skills') then s.planned_minutes * 3 + pg_temp.h(a.code || s.session_date || 'h') % 120 end
from sessions s
join athletes a on a.squad_id = s.squad_id and a.status = 'active'
cross join lateral (select exists (select 1 from injuries j where j.athlete_id = a.id and j.status = 'modified' and s.session_date > j.reported_on) as modified) m
where not exists (select 1 from injuries j where j.athlete_id = a.id and j.status <> 'modified'
                  and s.session_date > j.reported_on and (j.cleared_on is null or s.session_date < j.cleared_on))
  and not (m.modified and s.contact)
on conflict (session_id, athlete_id) do nothing;

-- Morning wellness: four weeks, the odd day missed.
insert into wellness (athlete_id, entry_date, sleep_hours, sleep_quality, fatigue, soreness, stress, mood)
select a.id, current_date - k, 6.5 + (pg_temp.h(a.code || k || 's') % 25) / 10.0,
       3 + pg_temp.h(a.code || k || 'q') % 3, 3 + pg_temp.h(a.code || k || 'f') % 3, 3 + pg_temp.h(a.code || k || 'o') % 3,
       3 + pg_temp.h(a.code || k || 't') % 3, 3 + pg_temp.h(a.code || k || 'm') % 3
from athletes a cross join generate_series(1, 28) k
where pg_temp.h(a.code || k) % 9 <> 0
on conflict (athlete_id, entry_date) do nothing;

-- This morning: three forms missing, one athlete well below their own normal, one short on sleep.
insert into wellness (athlete_id, entry_date, sleep_hours, sleep_quality, fatigue, soreness, stress, mood, comment)
select a.id, current_date, coalesce(v.sleep, 7.5), coalesce(v.q, 4 + pg_temp.h(a.code || 'q0') % 2), coalesce(v.f, 4 + pg_temp.h(a.code || 'f0') % 2),
       coalesce(v.o, 4 + pg_temp.h(a.code || 'o0') % 2), coalesce(v.t, 4 + pg_temp.h(a.code || 't0') % 2), coalesce(v.m, 4 + pg_temp.h(a.code || 'm0') % 2), v.comment
from athletes a
left join (values
  ('A004', 5.0, 2, 2, 1, 3, 2, 'Hip flexor tight after Saturday. Did not sleep well.'),
  ('W03', 5.5, null, null, null, null, null, 'Night shift')) v(code, sleep, q, f, o, t, m, comment) on v.code = a.code
where a.code not in ('A006', 'W02', 'U03')
on conflict (athlete_id, entry_date) do nothing;

insert into tests (code, name, unit, better) values
  ('CMJ', 'Countermovement jump', 'cm', 'higher'),
  ('SPR10', '10 m sprint', 's', 'lower'),
  ('YOYO', 'Yo-Yo intermittent recovery level 1', 'm', 'higher'),
  ('SQ3', 'Back squat 3RM', 'kg', 'higher')
on conflict (code) do nothing;

-- Pre-season (120 days ago) and the latest round (12 days ago).
insert into test_results (athlete_id, test_id, tested_on, value)
select a.id, t.id, current_date - r.k,
       case t.code
         when 'CMJ' then 36 + pg_temp.h(a.code || 'cmj') % 12 + case when r.k = 12 then (pg_temp.h(a.code || 'cmj2') % 5 - 1) * 0.5 else 0 end
         when 'SPR10' then 1.70 + (pg_temp.h(a.code || 'spr') % 15) / 100.0 - case when r.k = 12 then (pg_temp.h(a.code || 'spr2') % 3) / 100.0 else 0 end
         when 'YOYO' then 1240 + (pg_temp.h(a.code || 'yoyo') % 12) * 80 + case when r.k = 12 then (pg_temp.h(a.code || 'yoyo2') % 4) * 40 else 0 end
         else 140 + pg_temp.h(a.code || 'sq') % 50 + case when r.k = 12 then (pg_temp.h(a.code || 'sq2') % 4) * 2.5 else 0 end end
from athletes a join squads q on q.id = a.squad_id
cross join tests t cross join (values (120), (12)) r(k)
where (t.code <> 'SQ3' or q.code = 'SEN')
  and not exists (select 1 from injuries j where j.athlete_id = a.id and j.status = 'out' and j.reported_on < current_date - r.k)
on conflict (athlete_id, test_id, tested_on) do nothing;

-- Two results worth talking about: Finn's jump is down, Mere's Yo-Yo is well up.
update test_results r set value = p.value - 4.5
from test_results p, athletes a, tests t
where a.code = 'A007' and t.code = 'CMJ' and r.athlete_id = a.id and r.test_id = t.id and r.tested_on = current_date - 12
  and p.athlete_id = a.id and p.test_id = t.id and p.tested_on = current_date - 120;
update test_results r set value = p.value + 320
from test_results p, athletes a, tests t
where a.code = 'W01' and t.code = 'YOYO' and r.athlete_id = a.id and r.test_id = t.id and r.tested_on = current_date - 12
  and p.athlete_id = a.id and p.test_id = t.id and p.tested_on = current_date - 120;

insert into notes (athlete_id, staff_id, noted_on, body)
select a.id, s.id, current_date - v.k, v.body
from (values
  ('A003', 'PH1', 8, 'Cleared after hamstring rehab. Sprint volume to build back over two weeks.'),
  ('A008', 'DR1', 22, 'Third concussion in twelve months. Season review to be booked with Kahu and his family.'),
  ('W06', 'PH1', 4, 'Ankle settling. Review on Friday before any contact.')
) v(code, by_code, k, body)
join athletes a on a.code = v.code join staff s on s.code = v.by_code
where not exists (select 1 from notes n where n.athlete_id = a.id and n.body = v.body);
