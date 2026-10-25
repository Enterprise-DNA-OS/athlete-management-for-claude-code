#!/usr/bin/env node
// athlete-management-for-claude-code: the one CLI. The slash commands call this; so can you.
//
//   node scripts/athletes.mjs <command> [args] [--flags] [--json]
//   npm run athletes -- <command> ...
//
// Run with no arguments (or `help`) for the command list.
//
// This records what a high-performance programme, pro club, academy or university sport team runs
// every day: squads, athletes and staff; sessions with each athlete's minutes and RPE; the morning
// wellness questionnaire; injuries with their graded return to play and medical clearance; testing
// batteries; and staff safety checks for anyone working with under-18s. It sends nothing and talks
// to no other system: availability reports, return-to-play plans and check-ins are drafted here, a
// person sends them.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick, yesNo } from './lib/csv.mjs';
import { table, isoDate, heading, truncate } from './lib/format.mjs';

// ---------------------------------------------------------------- rules

const RULES = [
  { id: 'R1', rule: 'Written consent to collect health information from every active athlete', source: 'Privacy Act 2020 (NZ) and Health Information Privacy Code 2020 rule 3; Privacy Act 1988 (Cth) APP 3.3' },
  { id: 'R2', rule: 'No match after a concussion before the return-to-competition date and a medical clearance', source: 'ACC National Concussion Guidelines; AIS Concussion and Brain Health Position Statement 2024' },
  { id: 'R3', rule: 'No contact training after a concussion before the symptom-free days are done', source: 'AIS Concussion and Brain Health Position Statement 2024; ACC National Concussion Guidelines' },
  { id: 'R4', rule: 'Every concussion cleared by a doctor before return to play', source: 'ACC National Concussion Guidelines; AIS Concussion and Brain Health Position Statement 2024' },
  { id: 'R5', rule: 'Return-to-play stages done in order, at least a day apart', source: 'Amsterdam 2022 consensus statement on concussion in sport (BJSM 2023), return to sport strategy' },
  { id: 'R6', rule: 'A season review after a third concussion in twelve months', source: 'AIS Concussion and Brain Health Position Statement 2024' },
  { id: 'R7', rule: 'A current safety check for staff working with athletes under 18', source: 'Children\'s Act 2014 (NZ) safety checking; state working with children laws (AU), e.g. Child Protection (Working with Children) Act 2012 (NSW)' },
  { id: 'R8', rule: 'Every injury recorded with body area, mechanism and activity', source: 'IOC consensus statement on recording and reporting epidemiological data on injury and illness in sport 2020 (BJSM)' },
];

const STAGE_NAMES = ['Relative rest', 'Light activity', 'Aerobic and strength', 'Non-contact training', 'Full contact training', 'Return to competition'];

// ---------------------------------------------------------------- arguments

const BOOL_FLAGS = new Set(['json', 'help', 'all', 'dry-run', 'contact', 'changes', 'reverse', 'force']);

function parseArgv(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h') { flags.help = true; continue; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let name, value;
      if (eq > -1) { name = a.slice(2, eq); value = a.slice(eq + 1); }
      else {
        name = a.slice(2);
        const next = argv[i + 1];
        if (BOOL_FLAGS.has(name) || next === undefined || next.startsWith('--')) value = true;
        else value = argv[++i];
      }
      flags[name] = value;
    } else args.push(a);
  }
  return { args, flags };
}

class CliError extends Error {
  constructor(message, code = 1) { super(message); this.code = code; }
}

const n = (v) => Number(v ?? 0);
const str = (v) => (v === true || v === undefined || v === null ? '' : String(v));
const r1 = (v) => (v === null || v === undefined || v === '' ? null : Math.round(n(v) * 10) / 10);
const r2 = (v) => (v === null || v === undefined || v === '' ? null : Math.round(n(v) * 100) / 100);

let SETTINGS = {};

function today() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const addDays = (date, days) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

function parseDate(v, what = 'date') {
  if (!v || v === true) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.toLowerCase() === 'today') return today();
  if (s.toLowerCase() === 'tomorrow') return addDays(today(), 1);
  if (s.toLowerCase() === 'yesterday') return addDays(today(), -1);
  const rel = s.match(/^([+-]\d+)d?$/);
  if (rel) return addDays(today(), Number(rel[1]));
  // NZ and AU exports write DD/MM/YYYY, sometimes with a time after it.
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  throw new CliError(`"${v}" is not a ${what}. Use YYYY-MM-DD.`);
}

function parseNum(v, what, { min = 0, max = Infinity } = {}) {
  if (v === undefined || v === null || v === '' || v === true) return null;
  const x = Number(String(v).trim().replace(/[,\s]/g, '').replace(/(h|hrs?|mins?|m|cm|kg|s)$/i, ''));
  if (!Number.isFinite(x) || x < min || x > max) throw new CliError(`"${v}" is not a valid ${what}${Number.isFinite(max) ? ` (${min} to ${max})` : ''}.`);
  return x;
}
const score5 = (v, what) => { const x = parseNum(v, what, { min: 1, max: 5 }); return x === null ? null : Math.round(x); };

// ---------------------------------------------------------------- lookups

let db;
let JSON_OUT = false;

function ambiguous(what, rows, label) {
  return new CliError(`More than one ${what} matches. Be more specific:\n${rows.map((r) => `  ${label(r)}`).join('\n')}`);
}

async function findOne(what, ref, sql, exactKey, label, hint) {
  if (!ref || ref === true) throw new CliError(`Which ${what}? ${hint}`);
  const rows = await db.query(sql, [String(ref), `%${ref}%`]);
  const exact = rows.filter((r) => exactKey(r).some((k) => k && k.toLowerCase() === String(ref).toLowerCase()));
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new CliError(`No ${what} "${ref}". ${hint}`);
  throw ambiguous(what, exact.length ? exact : rows, label);
}

const findAthlete = (ref) => findOne('athlete', ref,
  `select * from athlete_list where lower(code) = lower($1) or name ilike $2 or lower(coalesce(external_id, '')) = lower($1) order by code`,
  (r) => [r.code, r.name, r.external_id], (r) => `${r.code}  ${r.name}  (${r.squad})`, 'Give the name, part of it, or the code (A004). Run: athletes athletes');
const findSquad = (ref) => findOne('squad', ref, `select * from squads where lower(code) = lower($1) or name ilike $2 order by code`,
  (r) => [r.code, r.name], (r) => `${r.code}  ${r.name}`, 'Give the squad code, for example SEN. Run: athletes squads');
const findStaff = (ref) => findOne('staff member', ref, `select * from staff where lower(code) = lower($1) or name ilike $2 order by code`,
  (r) => [r.code, r.name], (r) => `${r.code}  ${r.name}  (${r.role})`, 'Give the name or code (DR1). Run: athletes staff');
const findTest = (ref) => findOne('test', ref, `select * from tests where lower(code) = lower($1) or name ilike $2 order by code`,
  (r) => [r.code, r.name], (r) => `${r.code}  ${r.name}`, 'Give the test code, for example CMJ. Run: athletes tests');

async function findInjury(ref) {
  if (!ref || ref === true) throw new CliError('Which injury? Give its number (INJ-0006 or 6) or the athlete\'s name. Run: athletes injuries');
  const s = String(ref).toUpperCase();
  const want = /^\d+$/.test(s) ? `INJ-${s.padStart(4, '0')}` : s;
  let rows = await db.query(`select * from injury_register where upper(number) = $1 order by number`, [want]);
  if (!rows.length) rows = await db.query(`select * from injury_register where athlete ilike $1 and status <> 'cleared' order by reported_on desc`, [`%${ref}%`]);
  if (!rows.length) rows = await db.query(`select * from injury_register where athlete ilike $1 order by reported_on desc`, [`%${ref}%`]);
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new CliError(`No injury "${ref}". Run: athletes injuries --all`);
  throw ambiguous('injury', rows, (r) => `${r.number}  ${r.athlete}  ${r.diagnosis || r.kind}  (${r.status})`);
}

// Codes take the first letter of the squad's existing codes (A001 in SEN), or of the squad code.
async function nextAthleteCode(sq) {
  const [seen] = await db.query(`select substring(code from '^[A-Z]+') as prefix from athletes where squad_id = $1 and code ~ '^[A-Z]+[0-9]+$' limit 1`, [sq.id]);
  const prefix = seen?.prefix || sq.code.slice(0, 1).toUpperCase();
  const [r] = await db.query(`select coalesce(max(substring(code from '[0-9]+$')::int), 0) + 1 as next from athletes where code ~ $1`, [`^${prefix}[0-9]+$`]);
  return `${prefix}${String(r.next).padStart(3, '0')}`;
}

async function nextNumber(tbl, prefix) {
  const [r] = await db.query(`select coalesce(max(substring(number from '[0-9]+$')::int), 0) + 1 as next from ${tbl} where number like $1`, [`${prefix}%`]);
  return `${prefix}${String(r.next).padStart(4, '0')}`;
}

function out(data, human) {
  if (JSON_OUT) console.log(JSON.stringify(data, null, 2));
  else console.log(typeof human === 'function' ? human(data) : human);
}

function squadFilter(flags, params, col = 'squad') {
  if (!flags.squad) return '';
  params.push(String(flags.squad).toUpperCase());
  return ` and upper(${col}) = $${params.length}`;
}

// ---------------------------------------------------------------- overview

async function stats() {
  const [s] = await db.query(`select
      (select count(*) from athletes where status = 'active') as athletes,
      (select count(*) from squads) as squads,
      (select count(*) from availability where status = 'available') as available,
      (select count(*) from availability where status = 'modified') as modified,
      (select count(*) from availability where status = 'out') as out,
      (select count(*) from wellness_today where submitted) as wellness_in,
      (select count(*) from sessions where session_date > current_date - 7) as sessions_7d,
      (select coalesce(sum(load), 0) from daily_load where day > current_date - 7) as load_7d`);
  const loads = await loadRows({});
  const well = await wellnessRows({});
  const comp = await complianceRows();
  const r = {
    athletes: n(s.athletes), squads: n(s.squads), available: n(s.available), modified: n(s.modified), out: n(s.out),
    wellness_in: n(s.wellness_in), wellness_missing: n(s.athletes) - n(s.wellness_in), wellness_flags: well.filter((w) => w.flag && w.submitted).length,
    sessions_7d: n(s.sessions_7d), load_7d: n(s.load_7d), load_spikes: loads.filter((l) => l.flag.startsWith('spike')).length,
    compliance_breaches: comp.reduce((a, c) => a + c.count, 0),
  };
  out(r, (x) => [heading(`${SETTINGS.business_name}: today`),
    `  Squad        ${x.athletes} athletes in ${x.squads} squads: ${x.available} available, ${x.modified} modified, ${x.out} out`,
    `  Wellness     ${x.wellness_in} forms in, ${x.wellness_missing} missing, ${x.wellness_flags} flagged`,
    `  Load         ${x.sessions_7d} sessions in 7 days, ${Math.round(x.load_7d).toLocaleString('en-NZ')} AU of load, ${x.load_spikes} athletes on a spike`,
    `  Rules        ${x.compliance_breaches} breaches. Run: athletes compliance`].join('\n'));
}

// ---------------------------------------------------------------- athletes and staff

async function athletesCmd(flags) {
  const params = [];
  const rows = await db.query(`select a.code, a.name, a.squad, a.position, a.age, v.status, a.consent_on
    from athlete_list a left join availability v on v.athlete_id = a.id
    where (${flags.all ? 'true' : `a.status = 'active'`})${squadFilter(flags, params, 'a.squad')} order by a.squad, a.code`, params);
  out(rows, (d) => table(d, [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Athlete' }, { key: 'squad', label: 'Squad' }, { key: 'position', label: 'Position' },
    { key: 'age', label: 'Age', align: 'right' }, { key: 'status', label: 'Today' }, { key: 'consent_on', label: 'Consent', format: (v) => (v ? isoDate(v) : 'MISSING') }]));
}

async function athleteCard(args) {
  const a = await findAthlete(args.join(' '));
  const [v] = await db.query(`select * from availability where athlete_id = $1`, [a.id]);
  const [l] = await db.query(`select * from load_status where athlete_id = $1`, [a.id]);
  const wellness = await db.query(`select entry_date, score, sleep_hours, sleep_quality, fatigue, soreness, stress, mood, comment from wellness where athlete_id = $1 order by entry_date desc limit 7`, [a.id]);
  const injuries = await db.query(`select number, reported_on, kind, diagnosis, status, days_out, stage_reached, cleared_on from injury_register where athlete_id = $1 order by reported_on desc`, [a.id]);
  const tests = await db.query(`select test, test_name, unit, tested_on, value, previous, change, verdict from test_changes where athlete_id = $1 order by test`, [a.id]);
  const notes = await db.query(`select n.noted_on, n.body, s.name as by from notes n left join staff s on s.id = n.staff_id where n.athlete_id = $1 order by n.noted_on desc`, [a.id]);
  const data = { athlete: a, availability: v || null, load: l || null, wellness, injuries, tests, notes };
  out(data, () => [heading(`${a.name} (${a.code}): ${a.position || ''}, ${a.squad_name || 'no squad'}, ${a.age ?? '?'} years`),
    `  Today        ${v ? v.status.toUpperCase() : 'inactive'}${v?.injury ? `: ${v.diagnosis} (${v.injury})${v.expected_return ? `, expected back ${isoDate(v.expected_return)}` : ''}` : ''}`,
    `  Load         7 days ${Math.round(n(l?.acute))} AU, 28-day weekly average ${Math.round(n(l?.chronic))} AU, ratio ${l?.acwr ?? 'n/a'}`,
    `  Consent      ${a.consent_on ? `health information consent on file from ${isoDate(a.consent_on)}` : 'NO HEALTH INFORMATION CONSENT ON FILE'}`,
    '', '  Wellness, last 7 entries', table(wellness, [{ key: 'entry_date', label: 'Date', format: isoDate }, { key: 'score', label: 'Score', align: 'right' },
      { key: 'sleep_hours', label: 'Sleep h', align: 'right' }, { key: 'fatigue', label: 'Fatigue', align: 'right' }, { key: 'soreness', label: 'Soreness', align: 'right' },
      { key: 'stress', label: 'Stress', align: 'right' }, { key: 'mood', label: 'Mood', align: 'right' }, { key: 'comment', label: 'Comment', width: 40 }]),
    '', '  Injuries', table(injuries, [{ key: 'number', label: 'Injury' }, { key: 'reported_on', label: 'Reported', format: isoDate }, { key: 'diagnosis', label: 'Diagnosis', width: 34 },
      { key: 'status', label: 'Status' }, { key: 'days_out', label: 'Days', align: 'right' }, { key: 'stage_reached', label: 'Stage', align: 'right' }]),
    '', '  Testing', table(tests, [{ key: 'test_name', label: 'Test', width: 28 }, { key: 'tested_on', label: 'Latest', format: isoDate }, { key: 'value', label: 'Result', align: 'right', format: (x, r) => `${r2(x)} ${r.unit}` },
      { key: 'change', label: 'Change', align: 'right', format: (x) => (x === null ? '' : `${n(x) > 0 ? '+' : ''}${r2(x)}`) }, { key: 'verdict', label: 'Verdict' }]),
    notes.length ? '\n  Notes\n' + notes.map((x) => `    ${isoDate(x.noted_on)}  ${x.body}${x.by ? ` (${x.by})` : ''}`).join('\n') : ''].join('\n'));
}

async function addAthlete(args, flags) {
  const name = args.join(' ').trim();
  if (!name || !name.includes(' ')) throw new CliError('Give the athlete\'s first and last name, for example: add-athlete "Mia Tane" --squad=WMN');
  const sq = await findSquad(flags.squad);
  const [first, ...rest] = name.split(/\s+/);
  const code = flags.code ? String(flags.code).toUpperCase() : await nextAthleteCode(sq);
  const [a] = await db.query(`insert into athletes (code, first_name, last_name, squad_id, position, dob, consent_on) values ($1, $2, $3, $4, $5, $6::date, $7::date) returning *`,
    [code, first, rest.join(' '), sq.id, str(flags.position) || null, parseDate(flags.dob, 'date of birth'), parseDate(flags.consent, 'consent date')]);
  out(a, `Added ${a.first_name} ${a.last_name} as ${a.code} in ${sq.code}.${a.consent_on ? '' : ' No health information consent yet: record it with athletes consent ' + a.code}`);
}

async function consent(args, flags) {
  const a = await findAthlete(args.join(' '));
  const on = parseDate(flags.on) || today();
  await db.query(`update athletes set consent_on = $2::date where id = $1`, [a.id, on]);
  out({ code: a.code, consent_on: on }, `Health information consent recorded for ${a.name} on ${on}.`);
}

async function squads() {
  const rows = await db.query(`select q.code, q.name, q.sport, q.level, q.daily_medical,
      (select count(*) from athletes a where a.squad_id = q.id and a.status = 'active') as athletes,
      (select count(*) from athlete_list a where a.squad_id = q.id and a.status = 'active' and a.age < 18) as under_18
    from squads q order by q.code`);
  out(rows, (d) => table(d, [{ key: 'code', label: 'Squad' }, { key: 'name', label: 'Name' }, { key: 'sport', label: 'Sport' }, { key: 'level', label: 'Level' },
    { key: 'daily_medical', label: 'Daily medical', format: (v) => (v ? 'yes' : 'no') }, { key: 'athletes', label: 'Athletes', align: 'right' }, { key: 'under_18', label: 'Under 18', align: 'right' }]));
}

async function staffCmd() {
  const rows = await db.query(`select s.code, s.name, s.role, s.safety_check, s.safety_check_expires,
      (select string_agg(q.code, ', ' order by q.code) from squad_staff x join squads q on q.id = x.squad_id where x.staff_id = s.id) as squads,
      exists (select 1 from staff_with_minors m where m.id = s.id) as works_with_minors
    from staff s where s.active order by s.code`);
  out(rows, (d) => table(d, [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'role', label: 'Role' }, { key: 'squads', label: 'Squads' },
    { key: 'safety_check', label: 'Safety check' }, { key: 'safety_check_expires', label: 'Expires', format: (v, r) => (v ? isoDate(v) : r.works_with_minors ? 'NONE' : '') }]));
}

async function safetyCheck(args, flags) {
  const s = await findStaff(args.join(' '));
  const expires = parseDate(flags.expires, 'expiry date');
  if (!expires) throw new CliError('Give the expiry date: --expires=YYYY-MM-DD');
  await db.query(`update staff set safety_check = coalesce($2, safety_check, 'Safety check'), safety_check_expires = $3::date where id = $1`, [s.id, str(flags.kind) || null, expires]);
  out({ code: s.code, expires }, `${s.name}: safety check recorded, expires ${expires}.`);
}

// ---------------------------------------------------------------- availability and wellness

async function availabilityCmd(flags) {
  const params = [];
  const rows = await db.query(`select code, name, squad, position, status, injury, diagnosis, expected_return from availability where true${squadFilter(flags, params)}
    order by squad, case status when 'out' then 0 when 'modified' then 1 else 2 end, code`, params);
  out(rows, (d) => [...new Set(d.map((r) => r.squad))].map((sq) => {
    const g = d.filter((r) => r.squad === sq);
    const c = (st) => g.filter((r) => r.status === st).length;
    return heading(`${sq}: ${c('available')} available, ${c('modified')} modified, ${c('out')} out`) + '\n' + table(g.filter((r) => r.status !== 'available'),
      [{ key: 'name', label: 'Athlete' }, { key: 'position', label: 'Position' }, { key: 'status', label: 'Status' }, { key: 'diagnosis', label: 'Why', width: 40 },
        { key: 'expected_return', label: 'Expected back', format: isoDate }]);
  }).join('\n'));
}

async function wellnessRows(flags) {
  const params = [];
  const rows = await db.query(`select * from wellness_today where true${squadFilter(flags, params)} order by squad, code`, params);
  return rows.map((w) => {
    const f = [];
    if (!w.submitted) f.push('not submitted');
    else {
      if (w.vs_baseline !== null && n(w.vs_baseline) <= -SETTINGS.wellness_drop) f.push(`${Math.abs(r1(w.vs_baseline))} below their normal`);
      if (w.sleep_hours !== null && n(w.sleep_hours) < n(SETTINGS.sleep_min)) f.push(`${r1(w.sleep_hours)} h sleep`);
      for (const k of ['fatigue', 'soreness', 'stress', 'mood', 'sleep_quality']) if (n(w[k]) === 1) f.push(`${k.replace('_', ' ')} 1 of 5`);
    }
    return { ...w, vs_baseline: r1(w.vs_baseline), baseline: r1(w.baseline), flag: f.join('; ') };
  });
}

async function wellnessCmd(flags) {
  const rows = await wellnessRows(flags);
  const show = flags.all ? rows : rows.filter((r) => r.flag);
  out(show, (d) => [heading(`Wellness this morning: ${rows.filter((r) => r.submitted).length} of ${rows.length} in`),
    table(d, [{ key: 'name', label: 'Athlete' }, { key: 'squad', label: 'Squad' }, { key: 'score', label: 'Score', align: 'right' },
      { key: 'baseline', label: 'Normal', align: 'right' }, { key: 'sleep_hours', label: 'Sleep h', align: 'right' }, { key: 'flag', label: 'Flag', width: 60 }, { key: 'comment', label: 'Comment', width: 50 }]),
    flags.all ? '' : '\n  Showing flagged and missing only. --all for everyone.'].join('\n'));
}

async function logWellness(args, flags) {
  const a = await findAthlete(args.join(' '));
  const on = parseDate(flags.on) || today();
  const v = {
    sleep: parseNum(flags.sleep, 'hours of sleep', { max: 24 }), q: score5(flags.quality ?? 3, 'sleep quality'), f: score5(flags.fatigue, 'fatigue'),
    o: score5(flags.soreness, 'soreness'), t: score5(flags.stress, 'stress'), m: score5(flags.mood, 'mood'),
  };
  for (const [k, x] of Object.entries({ fatigue: v.f, soreness: v.o, stress: v.t, mood: v.m })) if (x === null) throw new CliError(`Give --${k} (1 to 5, 5 is best).`);
  const [w] = await db.query(`insert into wellness (athlete_id, entry_date, sleep_hours, sleep_quality, fatigue, soreness, stress, mood, comment)
    values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9)
    on conflict (athlete_id, entry_date) do update set sleep_hours = excluded.sleep_hours, sleep_quality = excluded.sleep_quality, fatigue = excluded.fatigue,
      soreness = excluded.soreness, stress = excluded.stress, mood = excluded.mood, comment = excluded.comment returning *`,
    [a.id, on, v.sleep, v.q, v.f, v.o, v.t, v.m, str(flags.comment) || null]);
  out(w, `Wellness for ${a.name} on ${on}: score ${w.score} of 25.`);
}

// ---------------------------------------------------------------- sessions and load

async function sessionsCmd(flags) {
  const days = parseNum(flags.days, 'days') || 14;
  const params = [days];
  const rows = await db.query(`select s.session_date, q.code as squad, s.title, s.kind, s.contact, s.planned_minutes,
      count(l.id) as athletes, round(avg(l.rpe), 1) as avg_rpe, coalesce(sum(l.load), 0) as total_load
    from sessions s join squads q on q.id = s.squad_id left join session_loads l on l.session_id = s.id
    where s.session_date > current_date - $1::int${squadFilter(flags, params, 'q.code')}
    group by s.id, q.code order by s.session_date desc, q.code, s.title`, params);
  out(rows, (d) => table(d, [{ key: 'session_date', label: 'Date', format: isoDate }, { key: 'squad', label: 'Squad' }, { key: 'title', label: 'Session' },
    { key: 'contact', label: 'Contact', format: (v) => (v ? 'yes' : '') }, { key: 'planned_minutes', label: 'Min', align: 'right' },
    { key: 'athletes', label: 'Athletes', align: 'right' }, { key: 'avg_rpe', label: 'RPE', align: 'right' }, { key: 'total_load', label: 'Load AU', align: 'right', format: (v) => Math.round(n(v)) }]));
}

async function addSession(args, flags) {
  const sq = await findSquad(args[0] || flags.squad);
  const kind = str(flags.kind) || 'field';
  const title = str(flags.title) || kind[0].toUpperCase() + kind.slice(1);
  const on = parseDate(flags.on) || today();
  const minutes = parseNum(flags.minutes, 'minutes', { max: 600 });
  if (!minutes) throw new CliError('Give the session length: --minutes=75');
  const contact = !!flags.contact || kind === 'match';
  const [s] = await db.query(`insert into sessions (squad_id, session_date, kind, title, contact, planned_minutes) values ($1, $2::date, $3, $4, $5, $6)
    on conflict (squad_id, session_date, title) do update set kind = excluded.kind, contact = excluded.contact, planned_minutes = excluded.planned_minutes returning *`,
    [sq.id, on, kind, title, contact, minutes]);
  let logged = [];
  let skipped = [];
  if (flags.rpe !== undefined) {
    const rpe = parseNum(flags.rpe, 'RPE', { max: 10 });
    const squad = await db.query(`select a.id, a.code, a.name, v.status from athlete_list a join availability v on v.athlete_id = a.id where a.squad_id = $1 order by a.code`, [sq.id]);
    for (const a of squad) {
      if (a.status === 'out' || (a.status === 'modified' && contact)) { skipped.push(`${a.name} (${a.status})`); continue; }
      const mins = a.status === 'modified' ? Math.round(minutes / 2) : minutes;
      await db.query(`insert into session_loads (session_id, athlete_id, minutes, rpe) values ($1, $2, $3, $4) on conflict (session_id, athlete_id) do update set minutes = excluded.minutes, rpe = excluded.rpe`, [s.id, a.id, mins, rpe]);
      logged.push(a.code);
    }
  }
  out({ session: s, logged, skipped }, `${sq.code} ${title} on ${on}: ${minutes} min${contact ? ', contact' : ''}.${flags.rpe !== undefined ? ` RPE ${flags.rpe} logged for ${logged.length} athletes.${skipped.length ? ` Not logged: ${skipped.join(', ')}.` : ''}` : ' Log each athlete with: athletes rpe <athlete> <rpe> --on=' + on}`);
}

async function rpeCmd(args, flags) {
  const value = args.pop();
  const a = await findAthlete(args.join(' '));
  const rpe = parseNum(value, 'RPE', { max: 10 });
  if (rpe === null) throw new CliError('Give the RPE (0 to 10) after the athlete\'s name.');
  const on = parseDate(flags.on) || today();
  const params = [a.squad_id, on];
  let sql = `select * from sessions where squad_id = $1 and session_date = $2::date`;
  if (flags.title) { params.push(`%${flags.title}%`); sql += ` and title ilike $3`; }
  const sessions = await db.query(sql + ' order by title', params);
  if (!sessions.length) throw new CliError(`No ${a.squad} session on ${on}. Add one first: athletes add-session ${a.squad} --kind=field --minutes=75 --on=${on}`);
  if (sessions.length > 1) throw ambiguous('session that day', sessions, (s) => `${s.title}  (use --title="${s.title}")`);
  const s = sessions[0];
  const minutes = parseNum(flags.minutes, 'minutes', { max: 600 }) ?? s.planned_minutes;
  const [l] = await db.query(`insert into session_loads (session_id, athlete_id, minutes, rpe) values ($1, $2, $3, $4)
    on conflict (session_id, athlete_id) do update set minutes = excluded.minutes, rpe = excluded.rpe returning *`, [s.id, a.id, minutes, rpe]);
  out(l, `${a.name}: ${s.title} on ${on}, ${minutes} min at RPE ${rpe} = ${Math.round(n(l.load))} AU.`);
}

async function loadRows(flags) {
  const params = [];
  const rows = await db.query(`select * from load_status where true${squadFilter(flags, params)} order by acwr desc nulls last, code`, params);
  const hi = n(SETTINGS.acwr_high), lo = n(SETTINGS.acwr_low), pct = n(SETTINGS.week_change_pct);
  return rows.map((r) => {
    const f = [];
    const acwr = r.acwr === null ? null : n(r.acwr);
    if (r.status !== 'out') {
      if (acwr !== null && acwr > hi) f.push(`spike: ratio ${acwr.toFixed(2)} over ${hi.toFixed(2)}`);
      else if (acwr !== null && acwr < lo && r.status === 'available') f.push(`under-loaded: ratio ${acwr.toFixed(2)} under ${lo.toFixed(2)}`);
      if (n(r.last_week) > 0 && n(r.acute) > n(r.last_week) * (1 + pct / 100)) f.push(`up ${Math.round((n(r.acute) / n(r.last_week) - 1) * 100)}% on last week`);
    }
    return { code: r.code, name: r.name, squad: r.squad, status: r.status, acute: Math.round(n(r.acute)), chronic: Math.round(n(r.chronic)),
      last_week: Math.round(n(r.last_week)), sessions_7d: n(r.sessions_7d), acwr: acwr === null ? null : r2(acwr), flag: f.join('; ') };
  });
}

async function loads(flags) {
  const rows = await loadRows(flags);
  out(rows, (d) => [heading('Training load: last 7 days against the 28-day weekly average (session RPE, AU)'),
    table(d, [{ key: 'name', label: 'Athlete' }, { key: 'squad', label: 'Squad' }, { key: 'status', label: 'Today' }, { key: 'sessions_7d', label: 'Sessions', align: 'right' },
      { key: 'acute', label: '7 days', align: 'right' }, { key: 'chronic', label: '28d avg', align: 'right' }, { key: 'last_week', label: 'Last wk', align: 'right' },
      { key: 'acwr', label: 'Ratio', align: 'right', format: (v) => (v === null ? '' : n(v).toFixed(2)) }, { key: 'flag', label: 'Flag', width: 50 }])].join('\n'));
}

// ---------------------------------------------------------------- injuries and return to play

const INJ_COLS = [{ key: 'number', label: 'Injury' }, { key: 'athlete', label: 'Athlete' }, { key: 'squad', label: 'Squad' }, { key: 'reported_on', label: 'Reported', format: isoDate },
  { key: 'diagnosis', label: 'Diagnosis', width: 34 }, { key: 'status', label: 'Status' }, { key: 'days_out', label: 'Days', align: 'right' },
  { key: 'stage_reached', label: 'Stage', align: 'right' }, { key: 'expected_return', label: 'Expected', format: isoDate }];

async function injuries(flags) {
  const params = [];
  const rows = await db.query(`select * from injury_register where (${flags.all ? 'true' : `status <> 'cleared'`})${squadFilter(flags, params)} order by reported_on desc`, params);
  out(rows, (d) => table(d, INJ_COLS));
}

async function concussionRow(id) {
  const [c] = await db.query(`select * from concussion_status where id = $1`, [id]);
  return c || null;
}

async function injuryCard(args) {
  const i = await findInjury(args.join(' '));
  const stages = await db.query(`select r.stage, r.name, r.completed_on, s.name as signed_by from rtp_stages r left join staff s on s.id = r.signed_by where r.injury_id = $1 order by r.stage`, [i.id]);
  const c = i.kind === 'concussion' ? await concussionRow(i.id) : null;
  out({ injury: i, stages, concussion: c }, () => [heading(`${i.number}: ${i.athlete} (${i.squad}), ${i.diagnosis || i.kind}`),
    `  Reported ${isoDate(i.reported_on)}, ${i.body_area || 'body area not recorded'}${i.side && i.side !== 'n/a' ? ` (${i.side})` : ''}, ${i.mechanism || 'mechanism not recorded'}, in ${i.activity || 'activity not recorded'}.`,
    `  Status ${i.status.toUpperCase()}, ${i.days_out} days${i.cleared_on ? `, cleared ${isoDate(i.cleared_on)} by ${i.cleared_by_name} (${i.cleared_by_role})` : i.expected_return ? `, expected back ${isoDate(i.expected_return)}` : ''}.`,
    c ? `  Concussion: ${c.elite_path ? 'adult with daily medical cover' : 'community or under-19 rules'}. Symptom free ${c.symptoms_resolved_on ? 'from ' + isoDate(c.symptoms_resolved_on) : 'NOT YET'}. Contact training from ${c.contact_ok_from ? isoDate(c.contact_ok_from) : 'not set'}, competition from ${c.competition_ok_from ? isoDate(c.competition_ok_from) : 'not set'}. ${c.doctor_cleared ? 'Cleared by a doctor.' : 'No doctor clearance.'}` : '',
    i.notes ? `  Notes: ${i.notes}` : '',
    '', table(stages, [{ key: 'stage', label: 'Stage', align: 'right' }, { key: 'name', label: 'Name' }, { key: 'completed_on', label: 'Done', format: isoDate }, { key: 'signed_by', label: 'Signed by' }])].filter((x) => x !== '').join('\n'));
}

async function logInjury(args, flags) {
  const a = await findAthlete(args.join(' '));
  const kind = str(flags.kind) || 'other';
  const number = await nextNumber('injuries', 'INJ-');
  const reported = parseDate(flags.on) || today();
  const expected = flags.expected ? (/^\+?\d+$/.test(String(flags.expected)) ? addDays(reported, Number(String(flags.expected).replace('+', ''))) : parseDate(flags.expected)) : null;
  const [i] = await db.query(`insert into injuries (number, athlete_id, reported_on, body_area, side, kind, mechanism, activity, diagnosis, status, expected_return, notes)
    values ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11::date, $12) returning *`,
    [number, a.id, reported, str(flags.area) || (kind === 'concussion' ? 'Head' : null), str(flags.side) || (kind === 'concussion' ? 'n/a' : null), kind,
      str(flags.mechanism) || null, str(flags.activity) || null, str(flags.diagnosis) || null, str(flags.status) || 'out', expected, str(flags.notes) || null]);
  const gaps = ['body_area', 'mechanism', 'activity'].filter((k) => !i[k]);
  out(i, `${number} logged for ${a.name}: ${i.diagnosis || kind}, ${i.status}.${kind === 'concussion' ? ' Concussion: no contact until symptom free and cleared. Record stages with: athletes stage ' + number + ' 1' : ''}${gaps.length ? ` Still to record: ${gaps.join(', ').replace('_', ' ')}.` : ''}`);
}

async function stageCmd(args, flags) {
  const stage = parseNum(args.pop(), 'stage', { min: 1, max: 6 });
  const i = await findInjury(args.join(' '));
  if (i.status === 'cleared') throw new CliError(`${i.number} is already cleared.`);
  const on = parseDate(flags.on) || today();
  const done = await db.query(`select stage, completed_on from rtp_stages where injury_id = $1 order by stage`, [i.id]);
  const prev = done.filter((d) => d.stage < stage).pop();
  if (stage > 1 && (!prev || prev.stage !== stage - 1)) throw new CliError(`Stage ${stage - 1} is not done for ${i.number}. Stages go in order.`);
  if (prev && daysBetween(isoDate(prev.completed_on), on) < 1 && !flags.force) throw new CliError(`Stage ${prev.stage} was done on ${isoDate(prev.completed_on)}. Each stage takes at least 24 hours (--force to record it anyway).`);
  if (i.kind === 'concussion' && stage >= 5) {
    const c = await concussionRow(i.id);
    if (!c.symptoms_resolved_on) throw new CliError(`${i.athlete} is not symptom free yet. Record it first: athletes symptom-free ${i.number} --on=YYYY-MM-DD`);
    if (on < isoDate(c.contact_ok_from) && !flags.force) throw new CliError(`Contact training for ${i.athlete} is not before ${isoDate(c.contact_ok_from)} (${c.free_days_needed} symptom-free days).`);
    if (stage === 6 && (on < isoDate(c.competition_ok_from)) && !flags.force) throw new CliError(`Return to competition for ${i.athlete} is not before ${isoDate(c.competition_ok_from)}.`);
  }
  const by = flags.by ? await findStaff(flags.by) : null;
  await db.query(`insert into rtp_stages (injury_id, stage, name, completed_on, signed_by) values ($1, $2, $3, $4::date, $5)
    on conflict (injury_id, stage) do update set completed_on = excluded.completed_on, signed_by = excluded.signed_by`, [i.id, stage, STAGE_NAMES[stage - 1], on, by?.id || null]);
  if (stage === 4 && i.status === 'out') await db.query(`update injuries set status = 'modified' where id = $1`, [i.id]);
  out({ number: i.number, stage, name: STAGE_NAMES[stage - 1], on }, `${i.number} ${i.athlete}: stage ${stage}, ${STAGE_NAMES[stage - 1]}, done ${on}.`);
}

async function symptomFree(args, flags) {
  const i = await findInjury(args.join(' '));
  if (i.kind !== 'concussion') throw new CliError(`${i.number} is not a concussion.`);
  const on = parseDate(flags.on) || today();
  await db.query(`update injuries set symptoms_resolved_on = $2::date where id = $1`, [i.id, on]);
  const c = await concussionRow(i.id);
  out(c, `${i.athlete} symptom free from ${on}. Contact training from ${isoDate(c.contact_ok_from)}, competition from ${isoDate(c.competition_ok_from)}.`);
}

async function clear(args, flags) {
  const i = await findInjury(args.join(' '));
  if (!flags.by) throw new CliError('Who cleared them? --by=<staff name or code>');
  const by = await findStaff(flags.by);
  const on = parseDate(flags.on) || today();
  if (i.kind === 'concussion') {
    if (by.role !== 'doctor' && !flags.force) throw new CliError(`A concussion is cleared by a doctor. ${by.name} is a ${by.role}.`);
    const c = await concussionRow(i.id);
    if (!c.symptoms_resolved_on) throw new CliError(`${i.athlete} is not recorded as symptom free.`);
    if (on < isoDate(c.contact_ok_from) && !flags.force) throw new CliError(`Too early: contact training is not before ${isoDate(c.contact_ok_from)}.`);
  }
  await db.query(`update injuries set status = 'cleared', cleared_on = $2::date, cleared_by = $3 where id = $1`, [i.id, on, by.id]);
  out({ number: i.number, cleared_on: on, by: by.name }, `${i.number}: ${i.athlete} cleared ${on} by ${by.name}.`);
}

async function rtpRows() {
  const open = await db.query(`select r.*, c.contact_ok_from, c.competition_ok_from, c.doctor_cleared, c.elite_path
    from injury_register r left join concussion_status c on c.id = r.id where r.status <> 'cleared' order by r.squad, r.expected_return nulls last`);
  return open.map((r) => {
    const next = r.stage_reached ? (r.stage_reached < 6 ? `stage ${r.stage_reached + 1}, ${STAGE_NAMES[r.stage_reached]}` : 'clearance') : r.kind === 'concussion' ? 'stage 1, Relative rest' : '';
    const late = r.expected_return && isoDate(r.expected_return) < today();
    return { ...r, next, overdue: !!late };
  });
}

async function rtp() {
  const rows = await rtpRows();
  out(rows, (d) => [heading('Return to play'), table(d, [{ key: 'athlete', label: 'Athlete' }, { key: 'squad', label: 'Squad' }, { key: 'diagnosis', label: 'Injury', width: 32 },
    { key: 'status', label: 'Status' }, { key: 'days_out', label: 'Days', align: 'right' }, { key: 'next', label: 'Next' },
    { key: 'contact_ok_from', label: 'Contact from', format: isoDate }, { key: 'competition_ok_from', label: 'Play from', format: isoDate },
    { key: 'expected_return', label: 'Expected', format: (v, r) => (v ? isoDate(v) + (r.overdue ? ' (passed)' : '') : '') }])].join('\n'));
}

// ---------------------------------------------------------------- testing

async function testsCmd() {
  const rows = await db.query(`select t.code, t.name, t.unit, t.better, count(r.id) as results, max(r.tested_on) as last_tested from tests t left join test_results r on r.test_id = t.id group by t.id order by t.code`);
  out(rows, (d) => table(d, [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Test' }, { key: 'unit', label: 'Unit' }, { key: 'better', label: 'Better' },
    { key: 'results', label: 'Results', align: 'right' }, { key: 'last_tested', label: 'Last tested', format: isoDate }]));
}

async function testing(flags) {
  const params = [];
  let where = 'true';
  if (flags.test) { const t = await findTest(flags.test); params.push(t.code); where += ` and test = $${params.length}`; }
  where += squadFilter(flags, params);
  if (flags.changes) where += ` and verdict in ('better', 'worse')`;
  const rows = (await db.query(`select * from test_changes where ${where} order by test, squad, value desc`, params)).map((r) => ({ ...r, value: r2(r.value), previous: r2(r.previous), change: r2(r.change), swc: r2(r.swc), squad_avg: r2(r.squad_avg) }));
  out(rows, (d) => table(d, [{ key: 'test', label: 'Test' }, { key: 'name', label: 'Athlete' }, { key: 'squad', label: 'Squad' }, { key: 'tested_on', label: 'Tested', format: isoDate },
    { key: 'value', label: 'Result', align: 'right' }, { key: 'previous', label: 'Before', align: 'right' }, { key: 'change', label: 'Change', align: 'right', format: (v) => (v === null ? '' : `${v > 0 ? '+' : ''}${v}`) },
    { key: 'swc', label: 'SWC', align: 'right' }, { key: 'verdict', label: 'Verdict' }]));
}

async function addResult(args, flags) {
  const value = parseNum(args.pop(), 'result', { min: -1e6 });
  const t = await findTest(args.pop());
  const a = await findAthlete(args.join(' '));
  const on = parseDate(flags.on) || today();
  const [r] = await db.query(`insert into test_results (athlete_id, test_id, tested_on, value) values ($1, $2, $3::date, $4)
    on conflict (athlete_id, test_id, tested_on) do update set value = excluded.value returning *`, [a.id, t.id, on, value]);
  out(r, `${a.name}: ${t.name} ${value} ${t.unit} on ${on}.`);
}

// ---------------------------------------------------------------- compliance and attention

async function complianceRows() {
  const q = (sql) => db.query(sql);
  const found = {
    R1: (await q(`select code, name, squad from athlete_list where status = 'active' and consent_on is null order by code`)).map((r) => `${r.name} (${r.code}, ${r.squad}): no health information consent`),
    R2: (await q(`select number, athlete, matches_early, competition_ok_from, cleared_on from concussion_status where matches_early > 0 order by number`)).map((r) =>
      `${r.athlete} (${r.number}): ${r.matches_early} match${n(r.matches_early) > 1 ? 'es' : ''} before ${r.competition_ok_from ? isoDate(r.competition_ok_from) : 'symptom free'}${r.cleared_on ? '' : ' with no clearance'}`),
    R3: (await q(`select number, athlete, contact_sessions_early, contact_ok_from from concussion_status where contact_sessions_early > 0 order by number`)).map((r) =>
      `${r.athlete} (${r.number}): ${r.contact_sessions_early} contact session${n(r.contact_sessions_early) > 1 ? 's' : ''} before ${r.contact_ok_from ? isoDate(r.contact_ok_from) : 'symptom free'}`),
    R4: (await q(`select number, athlete, cleared_on, cleared_by_name, cleared_by_role from concussion_status where status = 'cleared' and coalesce(cleared_by_role, '') <> 'doctor' order by number`)).map((r) =>
      `${r.athlete} (${r.number}): cleared ${isoDate(r.cleared_on)} by ${r.cleared_by_name ? `${r.cleared_by_name}, a ${r.cleared_by_role}` : 'nobody recorded'}`),
    R5: (await q(`select i.number, a.name, r.stage, r.completed_on, p.stage as prev_stage, p.completed_on as prev_on
        from rtp_stages r join injuries i on i.id = r.injury_id join athlete_list a on a.id = i.athlete_id
        left join rtp_stages p on p.injury_id = r.injury_id and p.stage = r.stage - 1
        where r.stage > 1 and (p.id is null or r.completed_on - p.completed_on < 1) order by i.number, r.stage`)).map((r) =>
      r.prev_stage ? `${r.name} (${r.number}): stage ${r.stage} done ${isoDate(r.completed_on)}, the same day as stage ${r.prev_stage}` : `${r.name} (${r.number}): stage ${r.stage} with no stage ${r.stage - 1}`),
    R6: (await q(`select distinct on (athlete_id) athlete, athlete_id, concussions_12m, reported_on from concussion_status where concussions_12m >= (select concussion_review_count from settings) order by athlete_id, reported_on desc`)).map((r) =>
      `${r.athlete}: ${r.concussions_12m} concussions in the 12 months to ${isoDate(r.reported_on)}`),
    R7: (await q(`select distinct name, code, role, safety_check_expires from staff_with_minors where safety_check_expires is null or safety_check_expires < current_date order by code`)).map((r) =>
      `${r.name} (${r.code}, ${r.role}): ${r.safety_check_expires ? `safety check expired ${isoDate(r.safety_check_expires)}` : 'no safety check on file'}`),
    R8: (await q(`select number, athlete, body_area, mechanism, activity from injury_register where body_area is null or mechanism is null or activity is null order by number`)).map((r) =>
      `${r.athlete} (${r.number}): missing ${['body_area', 'mechanism', 'activity'].filter((k) => !r[k]).join(', ').replace('_', ' ')}`),
  };
  return RULES.map((r) => ({ ...r, count: found[r.id].length, items: found[r.id] }));
}

async function compliance() {
  const rows = await complianceRows();
  out(rows, (d) => [heading('Rules: what the records say against each one'),
    ...d.map((r) => `  ${r.id}  ${r.count ? `${r.count} BREACH${r.count > 1 ? 'ES' : ''}` : 'clean'}  ${r.rule}\n      Source: ${r.source}${r.items.map((x) => `\n      - ${x}`).join('')}`),
    '', '  The rules and their sources are in docs/compliance.md. Your doctor, your sport\'s own policy and the law set the rules; this checks the records against them.'].join('\n'));
}

async function attentionRows() {
  const items = [];
  for (const r of await complianceRows()) for (const x of r.items) items.push({ area: 'rules', who: x.split(':')[0], what: `${r.id} ${r.rule}: ${x.split(': ').slice(1).join(': ')}`, owner: ['R1', 'R7'].includes(r.id) ? 'manager' : 'medical' });
  for (const r of await rtpRows()) if (r.overdue) items.push({ area: 'return to play', who: r.athlete, what: `${r.diagnosis || r.kind}: expected back ${isoDate(r.expected_return)}, still ${r.status}`, owner: 'medical' });
  for (const w of await wellnessRows({})) if (w.flag) items.push({ area: 'wellness', who: w.name, what: w.flag + (w.comment ? ` ("${truncate(w.comment, 50)}")` : ''), owner: w.submitted ? 'performance' : 'athlete' });
  for (const l of await loadRows({})) if (l.flag) items.push({ area: 'load', who: l.name, what: l.flag, owner: 'performance' });
  for (const t of await db.query(`select name, test_name, change, unit from test_changes where verdict = 'worse' order by name`)) items.push({ area: 'testing', who: t.name, what: `${t.test_name} down ${Math.abs(r2(t.change))} ${t.unit}, more than the smallest worthwhile change`, owner: 'performance' });
  return items;
}

async function attention() {
  const items = await attentionRows();
  out(items, (d) => [heading(`Needs attention: ${d.length}`), table(d, [{ key: 'area', label: 'Area' }, { key: 'who', label: 'Who', width: 26 }, { key: 'what', label: 'What', width: 90 }, { key: 'owner', label: 'Owner' }])].join('\n'));
}

// ---------------------------------------------------------------- notes and settings

async function logNote(args, flags) {
  const body = args.pop();
  if (!body) throw new CliError('Give the note in quotes after the athlete: log "Kate Brennan" "Cleared by Dr Reid"');
  const a = await findAthlete(args.join(' '));
  const by = flags.by ? await findStaff(flags.by) : null;
  const [x] = await db.query(`insert into notes (athlete_id, staff_id, body) values ($1, $2, $3) returning *`, [a.id, by?.id || null, body]);
  out(x, `Noted on ${a.name}.`);
}

async function settingsCmd(flags) {
  const editable = ['business_name', 'timezone', 'acwr_high', 'acwr_low', 'week_change_pct', 'wellness_drop', 'sleep_min', 'community_min_days', 'symptom_free_days', 'elite_symptom_free_days', 'concussion_review_count'];
  const sets = Object.keys(flags).filter((k) => editable.includes(k.replace(/-/g, '_')));
  for (const k of sets) await db.query(`update settings set ${k.replace(/-/g, '_')} = $1 where id = 1`, [String(flags[k])]);
  const [s] = await db.query(`select * from settings where id = 1`);
  out(s, () => [heading('Settings'), ...editable.map((k) => `  ${k.padEnd(24)} ${s[k]}`), sets.length ? `\n  Updated: ${sets.join(', ')}` : '\n  Change one with --<name>=<value>, for example --acwr_high=1.4'].join('\n'));
}

// ---------------------------------------------------------------- import (Smartabase CSV exports) and export

const KIND_MAP = { match: 'match', game: 'match', gym: 'gym', weights: 'gym', strength: 'gym', recovery: 'recovery', conditioning: 'conditioning', skills: 'skills', field: 'field', training: 'field', 'team training': 'field' };

async function importCmd(args, flags) {
  const [source, file] = args;
  if (source !== 'smartabase' || !file) throw new CliError('Usage: import smartabase <file.csv> --kind=athletes|wellness|rpe|injuries|tests [--squad=SEN] [--reverse] [--dry-run]');
  const kind = str(flags.kind);
  if (!['athletes', 'wellness', 'rpe', 'injuries', 'tests'].includes(kind)) throw new CliError('--kind must be athletes, wellness, rpe, injuries or tests');
  let rows;
  try { rows = parseCsv(readFileSync(path.resolve(file), 'utf8')); } catch (e) { throw new CliError(`Cannot read ${file}: ${e.message}`); }
  const res = { kind, rows: rows.length, added: 0, skipped: 0, problems: [] };
  const athleteFor = async (r, i) => {
    const ref = pick(r, 'Username', 'About', 'Athlete', 'Name', 'Full Name');
    if (!ref) { res.problems.push(`row ${i + 2}: no athlete (About or Username column)`); return null; }
    const found = await db.query(`select * from athlete_list where lower(coalesce(external_id, '')) = lower($1) or lower(name) = lower($1)`, [ref.trim()]);
    if (found.length !== 1) { res.problems.push(`row ${i + 2}: ${found.length ? 'more than one' : 'no'} athlete "${ref}"${found.length ? '' : ' (import athletes first)'}`); return null; }
    return found[0];
  };
  const flip = (v) => (v === null ? null : flags.reverse ? 6 - v : v);
  await db.exec('BEGIN');
  try {
    for (const [i, r] of rows.entries()) {
      if (kind === 'athletes') {
        const first = pick(r, 'First Name', 'Given Name') || pick(r, 'About', 'Name', 'Full Name').split(' ')[0];
        const last = pick(r, 'Last Name', 'Surname', 'Family Name') || pick(r, 'About', 'Name', 'Full Name').split(' ').slice(1).join(' ');
        if (!first || !last) { res.problems.push(`row ${i + 2}: no name`); continue; }
        const sqRef = pick(r, 'Group', 'Squad', 'Team') || str(flags.squad);
        const sq = sqRef ? (await db.query(`select * from squads where lower(code) = lower($1) or lower(name) = lower($1)`, [sqRef]))[0] : null;
        if (!sq) { res.problems.push(`row ${i + 2}: squad "${sqRef}" not found (add it, or pass --squad)`); continue; }
        const ext = pick(r, 'Username', 'User Name', 'ID') || `${first}.${last}`.toLowerCase();
        const dup = await db.query(`select 1 from athletes where lower(external_id) = lower($1) or (lower(first_name) = lower($2) and lower(last_name) = lower($3))`, [ext, first, last]);
        if (dup.length) { res.skipped++; continue; }
        await db.query(`insert into athletes (code, first_name, last_name, squad_id, position, dob, external_id, consent_on) values ($1, $2, $3, $4, $5, $6::date, $7, $8::date)`,
          [await nextAthleteCode(sq), first, last, sq.id, pick(r, 'Position') || null, parseDate(pick(r, 'Date of Birth', 'DOB')) || null, ext, parseDate(pick(r, 'Consent Date', 'Consent')) || null]);
        res.added++;
      } else if (kind === 'wellness') {
        const a = await athleteFor(r, i); if (!a) continue;
        const date = parseDate(pick(r, 'Date', 'Start Date'));
        const v = {
          sleep: parseNum(pick(r, 'Sleep Hours', 'Hours Slept', 'Sleep Duration'), 'sleep hours', { max: 24 }),
          q: flip(score5(pick(r, 'Sleep Quality', 'Sleep'), 'sleep quality')), f: flip(score5(pick(r, 'Fatigue'), 'fatigue')),
          o: flip(score5(pick(r, 'Muscle Soreness', 'Soreness'), 'soreness')), t: flip(score5(pick(r, 'Stress'), 'stress')), m: flip(score5(pick(r, 'Mood'), 'mood')),
        };
        if ([v.q, v.f, v.o, v.t, v.m].some((x) => x === null)) { res.problems.push(`row ${i + 2}: a wellness item is empty`); continue; }
        const ins = await db.query(`insert into wellness (athlete_id, entry_date, sleep_hours, sleep_quality, fatigue, soreness, stress, mood, comment) values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9)
          on conflict (athlete_id, entry_date) do nothing returning id`, [a.id, date, v.sleep, v.q, v.f, v.o, v.t, v.m, pick(r, 'Comments', 'Comment', 'Notes') || null]);
        ins.length ? res.added++ : res.skipped++;
      } else if (kind === 'rpe') {
        const a = await athleteFor(r, i); if (!a) continue;
        const date = parseDate(pick(r, 'Date', 'Start Date'));
        const typ = (pick(r, 'Session Type', 'Type') || 'field').toLowerCase();
        const sKind = KIND_MAP[typ] || 'field';
        const title = pick(r, 'Session', 'Session Name', 'Title') || (sKind[0].toUpperCase() + sKind.slice(1));
        const minutes = parseNum(pick(r, 'Duration', 'Minutes', 'Duration (min)'), 'minutes', { max: 600 });
        const rpe = parseNum(pick(r, 'RPE', 'sRPE', 'Session RPE'), 'RPE', { max: 10 });
        if (minutes === null || rpe === null) { res.problems.push(`row ${i + 2}: no duration or RPE`); continue; }
        const contact = sKind === 'match' || yesNo(pick(r, 'Contact'));
        const [s] = await db.query(`insert into sessions (squad_id, session_date, kind, title, contact, planned_minutes) values ($1, $2::date, $3, $4, $5, $6)
          on conflict (squad_id, session_date, title) do update set squad_id = excluded.squad_id returning id`, [a.squad_id, date, sKind, title, contact, minutes]);
        const ins = await db.query(`insert into session_loads (session_id, athlete_id, minutes, rpe, distance_m, hsr_m) values ($1, $2, $3, $4, $5, $6) on conflict (session_id, athlete_id) do nothing returning id`,
          [s.id, a.id, minutes, rpe, parseNum(pick(r, 'Total Distance', 'Distance'), 'distance', { max: 1e6 }), parseNum(pick(r, 'HSR', 'High Speed Running'), 'HSR', { max: 1e6 })]);
        ins.length ? res.added++ : res.skipped++;
      } else if (kind === 'injuries') {
        const a = await athleteFor(r, i); if (!a) continue;
        const reported = parseDate(pick(r, 'Date of Injury', 'Injury Date', 'Date'));
        const area = pick(r, 'Body Area', 'Body Part', 'Location') || null;
        const typ = (pick(r, 'Injury Type', 'Type', 'Pathology') || 'other').toLowerCase();
        const iKind = ['concussion', 'muscle', 'ligament', 'tendon', 'bone', 'joint', 'illness'].find((k) => typ.includes(k)) || (typ.includes('fracture') ? 'bone' : typ.includes('strain') ? 'muscle' : typ.includes('sprain') ? 'ligament' : 'other');
        const dup = await db.query(`select 1 from injuries where athlete_id = $1 and reported_on = $2::date and kind = $3`, [a.id, reported, iKind]);
        if (dup.length) { res.skipped++; continue; }
        const mech = (pick(r, 'Mechanism', 'Contact/Non-Contact') || '').toLowerCase();
        const act = (pick(r, 'Activity', 'Occurred During') || '').toLowerCase();
        const cleared = parseDate(pick(r, 'Date Cleared', 'Return Date', 'Cleared'));
        const status = cleared ? 'cleared' : /modif/i.test(pick(r, 'Status', 'Availability')) ? 'modified' : 'out';
        await db.query(`insert into injuries (number, athlete_id, reported_on, body_area, side, kind, mechanism, activity, diagnosis, status, expected_return, cleared_on, notes)
          values ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11::date, $12::date, $13)`,
          [await nextNumber('injuries', 'INJ-'), a.id, reported, area, ['left', 'right', 'both'].find((s) => (pick(r, 'Side') || '').toLowerCase().startsWith(s)) || (area ? 'n/a' : null), iKind,
            mech.includes('non') ? 'non-contact' : mech.includes('contact') ? 'contact' : mech.includes('overuse') ? 'overuse' : iKind === 'illness' ? 'illness' : null,
            act.includes('match') || act.includes('game') ? 'match' : act.includes('train') ? 'training' : act ? 'other' : null,
            pick(r, 'Diagnosis', 'Injury Description', 'Description') || null, status, parseDate(pick(r, 'Expected Return', 'Estimated Return')) || null, cleared || null, pick(r, 'Notes', 'Comments') || null]);
        res.added++;
      } else if (kind === 'tests') {
        const a = await athleteFor(r, i); if (!a) continue;
        const date = parseDate(pick(r, 'Date', 'Test Date'));
        const testRef = pick(r, 'Test', 'Test Name', 'Metric');
        const value = parseNum(pick(r, 'Result', 'Value', 'Score'), 'result', { min: -1e6, max: 1e9 });
        if (!testRef || value === null) { res.problems.push(`row ${i + 2}: no test or result`); continue; }
        let [t] = await db.query(`select * from tests where lower(code) = lower($1) or lower(name) = lower($1)`, [testRef]);
        if (!t) {
          [t] = await db.query(`insert into tests (code, name, unit, better) values ($1, $2, $3, 'higher') returning *`, [testRef.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 12), testRef, pick(r, 'Unit') || '']);
          res.problems.push(`new test "${testRef}" added as higher-is-better: check it with athletes tests`);
        }
        const ins = await db.query(`insert into test_results (athlete_id, test_id, tested_on, value) values ($1, $2, $3::date, $4) on conflict (athlete_id, test_id, tested_on) do nothing returning id`, [a.id, t.id, date, value]);
        ins.length ? res.added++ : res.skipped++;
      }
    }
    await db.exec(flags['dry-run'] ? 'ROLLBACK' : 'COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    if (e instanceof CliError) throw new CliError(`Import stopped, nothing saved: ${e.message}`);
    throw e;
  }
  res.dry_run = !!flags['dry-run'];
  out(res, `${res.dry_run ? 'Test run, nothing saved: would add' : 'Added'} ${res.added} ${kind} rows, ${res.skipped} already there, ${res.problems.length} problems.${res.problems.length ? '\n' + res.problems.map((p) => '  ' + p).join('\n') : ''}`);
}

function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v) => { const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n';
}

async function exportCmd(flags) {
  const dir = path.resolve(REPO_ROOT, str(flags.out) || path.join('exports', today()));
  mkdirSync(dir, { recursive: true });
  const files = [];
  for (const t of ['squads', 'staff', 'athletes', 'sessions', 'session_loads', 'wellness', 'injuries', 'rtp_stages', 'tests', 'test_results', 'notes']) {
    const rows = await db.query(`select * from ${t}`);
    writeFileSync(path.join(dir, `${t}.csv`), toCsv(rows));
    files.push({ table: t, rows: rows.length });
  }
  out({ dir, files }, `Exported ${files.length} files to ${dir}:\n${files.map((f) => `  ${f.table}.csv  ${f.rows} rows`).join('\n')}`);
}

// ---------------------------------------------------------------- dispatch

const HELP = `Athlete Management for Claude Code

  node scripts/athletes.mjs <command> [args] [--json]

  Overview    stats | attention | compliance | settings [--acwr_high=1.4 ...]
  Squad       athletes [--squad] [--all] | athlete <name> | add-athlete "<first last>" --squad [--position --dob --consent] | consent <name> [--on]
              squads | staff | safety-check <staff> --expires=YYYY-MM-DD [--kind] | log <name> "<note>" [--by]
  Today       availability [--squad] | wellness [--squad] [--all] | log-wellness <name> --sleep --quality --fatigue --soreness --stress --mood [--comment] [--on]
  Load        sessions [--days=14] [--squad] | add-session <squad> --kind --minutes [--title] [--contact] [--rpe] [--on] | rpe <name> <rpe> [--minutes] [--title] [--on] | loads [--squad]
  Injuries    injuries [--all] | injury <number|name> | log-injury <name> --kind --area --side --mechanism --activity --diagnosis [--status] [--expected=+14] [--on]
              rtp | stage <injury> <1-6> [--by] [--on] | symptom-free <injury> [--on] | clear <injury> --by=<doctor> [--on]
  Testing     tests | testing [--test] [--squad] [--changes] | add-result <name> <test> <value> [--on]
  Data        import smartabase <file.csv> --kind=athletes|wellness|rpe|injuries|tests [--squad] [--reverse] [--dry-run] | export [--out=dir]`;

const COMMANDS = {
  stats: () => stats(), attention: () => attention(), compliance: () => compliance(), settings: (a, f) => settingsCmd(f),
  athletes: (a, f) => athletesCmd(f), athlete: (a) => athleteCard(a), 'add-athlete': (a, f) => addAthlete(a, f), consent: (a, f) => consent(a, f),
  squads: () => squads(), staff: () => staffCmd(), 'safety-check': (a, f) => safetyCheck(a, f), log: (a, f) => logNote(a, f),
  availability: (a, f) => availabilityCmd(f), wellness: (a, f) => wellnessCmd(f), 'log-wellness': (a, f) => logWellness(a, f),
  sessions: (a, f) => sessionsCmd(f), 'add-session': (a, f) => addSession(a, f), rpe: (a, f) => rpeCmd(a, f), loads: (a, f) => loads(f),
  injuries: (a, f) => injuries(f), injury: (a) => injuryCard(a), 'log-injury': (a, f) => logInjury(a, f), rtp: () => rtp(),
  stage: (a, f) => stageCmd(a, f), 'symptom-free': (a, f) => symptomFree(a, f), clear: (a, f) => clear(a, f),
  tests: () => testsCmd(), testing: (a, f) => testing(f), 'add-result': (a, f) => addResult(a, f),
  import: (a, f) => importCmd(a, f), export: (a, f) => exportCmd(f),
};

const { args, flags } = parseArgv(process.argv.slice(2));
JSON_OUT = !!flags.json;
const cmd = args.shift();
if (!cmd || cmd === 'help' || flags.help || !COMMANDS[cmd]) {
  console.log(HELP);
  process.exit(cmd && cmd !== 'help' && !COMMANDS[cmd] ? 1 : 0);
}
db = await getDb();
try {
  [SETTINGS] = await db.query(`select * from settings where id = 1`);
  await COMMANDS[cmd](args, flags);
} catch (e) {
  if (e instanceof CliError) { console.error(e.message); process.exitCode = e.code; }
  else { console.error(e.stack || e.message); process.exitCode = 2; }
} finally {
  await db.close();
}
