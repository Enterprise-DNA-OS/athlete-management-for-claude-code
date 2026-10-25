#!/usr/bin/env node
// End-to-end smoke test on a throwaway embedded database: migrate, seed, then every command
// that matters, asserting on the JSON. Passes on Windows and Linux. No network, no Postgres install.
// TEST_DATABASE_URL runs the same test against a real Postgres (CI does this).

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'athletes-smoke-'));
const exportDir = path.join(dataDir, 'export');
const env = { ...process.env, DATA_DIR: dataDir, OUTPUT_DIR: dataDir };
delete env.DATABASE_URL;
if (process.env.TEST_DATABASE_URL) env.DATABASE_URL = process.env.TEST_DATABASE_URL;

let step = 0;
function run(label, args, { json = true, expectFail = false } = {}) {
  step++;
  const argv = [path.join(root, 'scripts', args[0]), ...args.slice(1), ...(json ? ['--json'] : [])];
  const res = spawnSync(process.execPath, argv, { cwd: root, env, encoding: 'utf8' });
  const ok = expectFail ? res.status === 1 : res.status === 0;
  if (!ok) {
    console.error(`\nFAIL step ${step} (${label}): exit ${res.status}\n--- stdout\n${res.stdout}\n--- stderr\n${res.stderr}`);
    process.exit(1);
  }
  console.log(`  ok  ${String(step).padStart(2)}  ${label}`);
  if (!json || expectFail) return { stdout: res.stdout, stderr: res.stderr };
  try { return JSON.parse(res.stdout); } catch {
    console.error(`\nFAIL step ${step} (${label}): output is not JSON\n${res.stdout}\n${res.stderr}`);
    process.exit(1);
  }
}
function assert(cond, msg) { if (!cond) { console.error(`\nFAIL assertion: ${msg}`); process.exit(1); } }
const A = (...a) => ['athletes.mjs', ...a];
const counts = (rows) => Object.fromEntries(rows.map((x) => [x.id, x.count]));
const ex = (f) => path.join(root, 'examples', f);

console.log(`smoke: ${env.DATABASE_URL ? 'Postgres' : 'embedded database in ' + dataDir}`);
try {
  run('migrate', ['migrate.mjs'], { json: false });
  run('migrate again (idempotent)', ['migrate.mjs'], { json: false });
  run('seed', ['seed.mjs'], { json: false });
  const s1 = run('stats', A('stats'));
  run('seed again (idempotent)', ['seed.mjs'], { json: false });
  const stats = run('stats after a second seed', A('stats'));
  assert(JSON.stringify(s1) === JSON.stringify(stats), 'a second seed changes nothing');
  assert(stats.athletes === 23 && stats.squads === 3 && stats.out === 3 && stats.modified === 1 && stats.available === 19, `squad ${JSON.stringify(stats)}`);
  assert(stats.wellness_in === 20 && stats.wellness_missing === 3 && stats.wellness_flags === 2 && stats.compliance_breaches === 10, `today ${JSON.stringify(stats)}`);

  // ---- the rules
  const c0 = counts(run('compliance', A('compliance')));
  assert(c0.R1 === 2 && c0.R2 === 1 && c0.R3 === 1 && c0.R4 === 1 && c0.R5 === 1 && c0.R6 === 1 && c0.R7 === 2 && c0.R8 === 1, `compliance counts ${JSON.stringify(c0)}`);
  const att = run('attention', A('attention'));
  assert(att[0].area === 'rules' && att.filter((a) => a.area === 'rules').length === 10, 'rules lead the attention list');
  assert(att.some((a) => a.area === 'load' && a.who === 'Ioane Sapolu' && /spike/.test(a.what)) && att.some((a) => a.area === 'testing' && a.who === 'Finn Mathers'), 'the spike and the jump drop are there');

  // ---- today
  const av = run('availability', A('availability'));
  assert(av.length === 23 && av.find((a) => a.name === 'Ben Carver').status === 'out' && av.find((a) => a.name === 'Ruby Kingi').status === 'modified', 'Ben out, Ruby modified');
  const well = run('wellness', A('wellness'));
  assert(well.filter((w) => !w.submitted).length === 3 && /below their normal/.test(well.find((w) => w.name === 'Will Henare').flag), 'three missing, Will well below his normal');
  const loads = run('loads', A('loads'));
  assert(/^spike/.test(loads.find((l) => l.name === 'Ioane Sapolu').flag) && loads.find((l) => l.name === 'Ben Carver').flag === '', 'Ioane spiking after his hamstring, Ben out so not flagged');
  const rtp = run('return to play', A('rtp'));
  assert(rtp.length === 4 && rtp.find((r) => r.athlete === 'Ben Carver').next.startsWith('stage 5'), 'four open, Ben at stage 5 next');
  const card = run('athlete card by part name', A('athlete', 'brennan'));
  assert(card.injuries.length === 1 && card.wellness.length > 0 && card.athlete.code === 'W04', 'Kate Brennan card');
  run('ambiguous name lists and exits 1', A('athlete', 'ka'), { json: false, expectFail: true });
  run('unknown athlete exits 1', A('athlete', 'Nobody Here'), { json: false, expectFail: true });
  const inj = run('injury card', A('injury', '6'));
  assert(inj.concussion && inj.concussion.doctor_cleared === false && inj.stages.length === 3, 'INJ-0006 cleared by a physio');

  // ---- concussion gates
  run('full contact before the symptom-free days is refused', A('stage', 'INJ-0008', '5'), { json: false, expectFail: true });
  run('a physio clearing a concussion is refused', A('clear', 'INJ-0008', '--by=PH1'), { json: false, expectFail: true });
  run('a doctor clearing before the contact date is refused', A('clear', 'INJ-0008', '--by=DR1'), { json: false, expectFail: true });
  const ni = run('log a concussion', A('log-injury', 'Jack Tamati', '--kind=concussion', '--mechanism=contact', '--activity=match', '--diagnosis=Concussion, tackle'));
  assert(ni.number === 'INJ-0011' && ni.body_area === 'Head', 'new concussion numbered and on the head');
  run('stage 1', A('stage', 'INJ-0011', '1', '--by=DR1'));
  run('stage 2 the same day is refused', A('stage', 'INJ-0011', '2'), { json: false, expectFail: true });
  run('stage 3 before stage 2 is refused', A('stage', 'INJ-0011', '3', '--on=+2'), { json: false, expectFail: true });
  const sf = run('symptom free', A('symptom-free', 'INJ-0011'));
  assert(sf.free_days_needed === 10 && sf.elite_path === true, 'adult with daily medical cover: 10 days');
  const u = run('youth concussion dates', A('injury', 'INJ-0004'));
  assert(u.concussion.free_days_needed === 14 && u.concussion.elite_path === false, 'under-19: 14 days');

  // ---- load
  const ses = run('add a session with RPE for the squad', A('add-session', 'SEN', '--kind=field', '--title=Extra skills', '--minutes=40', '--rpe=5'));
  assert(ses.logged.length === 7 && ses.skipped.length === 3, `7 logged, Ben, Sione and Jack out (${ses.skipped})`);
  const one = run('one athlete RPE', A('rpe', 'Will Henare', '3', '--title=Extra', '--minutes=30'));
  assert(Number(one.load) === 90, '30 min at RPE 3 = 90 AU');
  run('RPE with no session that day exits 1', A('rpe', 'Mere Tipene', '6', '--on=+3'), { json: false, expectFail: true });
  run('sessions', A('sessions', '--days=7'));

  // ---- wellness, consent, safety checks, testing
  run('log wellness', A('log-wellness', 'Rory Ngata', '--sleep=8', '--quality=4', '--fatigue=4', '--soreness=4', '--stress=5', '--mood=4'));
  run('wellness out of range is refused', A('log-wellness', 'Eli Moana', '--fatigue=7', '--soreness=3', '--stress=3', '--mood=3'), { json: false, expectFail: true });
  run('consent', A('consent', 'Lucy Arnold'));
  run('safety check', A('safety-check', 'Dan Hirini', '--expires=+365', '--kind=NZ Police vet'));
  const c1 = counts(run('compliance after the fixes', A('compliance')));
  assert(c1.R1 === 1 && c1.R7 === 1, `consent and the safety check cleared (${JSON.stringify(c1)})`);
  const t = run('testing changes', A('testing', '--changes', '--test=CMJ'));
  assert(t.find((x) => x.name === 'Finn Mathers').verdict === 'worse', 'Finn jump down');
  run('add a result', A('add-result', 'Finn Mathers', 'CMJ', '41', '--on=today'));
  run('note', A('log', 'Will Henare', 'Hip flexor checked, fine to train', '--by=PH1'));
  const st = run('settings change', A('settings', '--acwr_high=5'));
  assert(Number(st.acwr_high) === 5, 'threshold changed');
  assert(!run('loads with the new threshold', A('loads')).some((l) => /^spike/.test(l.flag)), 'no spikes over 5');
  run('settings back', A('settings', '--acwr_high=1.5'));

  // ---- import from Smartabase exports
  const dry = run('import athletes, test run', A('import', 'smartabase', ex('smartabase-athletes.csv'), '--kind=athletes', '--dry-run'));
  assert(dry.added === 2 && dry.dry_run, 'test run would add two');
  assert(run('nothing saved by the test run', A('athletes')).length === 23, 'still 23');
  const ia = run('import athletes', A('import', 'smartabase', ex('smartabase-athletes.csv'), '--kind=athletes'));
  assert(ia.added === 2, 'two athletes');
  assert(run('import athletes again skips', A('import', 'smartabase', ex('smartabase-athletes.csv'), '--kind=athletes')).skipped === 2, 'no doubles');
  const roster = run('new codes follow the squad', A('athletes', '--squad=SEN'));
  assert(roster.some((a) => a.code === 'A011' && a.name === 'Josh Kereama'), 'Josh is A011');
  const iw = run('import wellness', A('import', 'smartabase', ex('smartabase-wellness.csv'), '--kind=wellness'));
  assert(iw.added === 3 && iw.problems.length === 0, 'three wellness forms');
  assert(run('import wellness again skips', A('import', 'smartabase', ex('smartabase-wellness.csv'), '--kind=wellness')).skipped === 3, 'no doubles');
  const ir = run('import RPE', A('import', 'smartabase', ex('smartabase-rpe.csv'), '--kind=rpe'));
  assert(ir.added === 3, 'three RPE rows');
  const ii = run('import injuries', A('import', 'smartabase', ex('smartabase-injuries.csv'), '--kind=injuries'));
  assert(ii.added === 2, 'two injuries');
  const mia = run('imported injury maps', A('athlete', 'Mia Tane'));
  assert(mia.availability.status === 'modified' && mia.injuries[0].diagnosis === 'Quad haematoma', 'Mia on modified with her quad');
  const it = run('import tests', A('import', 'smartabase', ex('smartabase-tests.csv'), '--kind=tests'));
  assert(it.added === 3 && it.problems.some((p) => /Broad Jump/.test(p)), 'three results, Broad Jump added as a new test');
  run('import with no kind exits 1', A('import', 'smartabase', ex('smartabase-tests.csv')), { json: false, expectFail: true });

  // ---- views, documents, export
  run('views', ['view.mjs'], { json: false });
  for (const v of ['week', 'loads', 'injuries']) assert(existsSync(path.join(dataDir, 'views', `${v}.html`)), `view ${v}`);
  run('documents', ['docs.mjs'], { json: false });
  for (const d of ['availability-report', 'return-to-play', 'testing-report']) assert(readdirSync(path.join(dataDir, 'docs-out', d)).length > 0, `document ${d}`);
  const exp = run('export', A('export', `--out=${exportDir}`));
  assert(exp.files.length === 11 && existsSync(path.join(exportDir, 'wellness.csv')), 'eleven files');
  run('help', A('help'), { json: false });
  console.log(`\nPASS: ${step} steps`);
} finally {
  rmSync(dataDir, { recursive: true, force: true });
}
