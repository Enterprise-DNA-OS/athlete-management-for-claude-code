#!/usr/bin/env node
// Loads supabase/seed.sql: Southern Lakes Rugby, a fictional provincial union with a men's squad,
// a women's squad and an under-18 academy, six weeks of sessions and RPE, four weeks of wellness,
// injuries with their return-to-play stages, two rounds of testing and staff safety checks. Dates
// are relative to today and every insert skips what is already there, so re-running it is harmless.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';

export async function seed(db) {
  await db.exec(readFileSync(path.join(REPO_ROOT, 'supabase', 'seed.sql'), 'utf8'));
  const [c] = await db.query(`
    select (select count(*) from athletes) as athletes, (select count(*) from squads) as squads, (select count(*) from staff) as staff,
           (select count(*) from sessions) as sessions, (select count(*) from session_loads) as loads, (select count(*) from wellness) as wellness,
           (select count(*) from injuries) as injuries, (select count(*) from test_results) as tests`);
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)]));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const db = await getDb();
  try {
    const n = await seed(db);
    console.log(`seed: ${n.athletes} athletes in ${n.squads} squads, ${n.staff} staff, ${n.sessions} sessions, ${n.loads} RPE entries, ${n.wellness} wellness forms, ${n.injuries} injuries, ${n.tests} test results`);
  } finally {
    await db.close();
  }
}
