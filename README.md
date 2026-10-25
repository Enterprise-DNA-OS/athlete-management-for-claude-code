<h1 align="center">Athlete Management for Claude Code</h1>

<p align="center">
  <strong>The open-source athlete management system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Smartabase data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=smartabase">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/smartabase?utm_source=github&utm_medium=readme&utm_campaign=smartabase">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-smartabase">Instead of Smartabase</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Athlete Management for Claude Code does the job you pay Smartabase for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it answers questions nobody built a Smartabase dashboard for.

Smartabase, renamed Teamworks AMS, publishes no price: Teamworks quotes each organisation privately, by the products it takes, with bundle discounts through its Elite programme (explore.teamworks.com, checked 25 October 2026). This costs nothing, or a setup fee and a retainer if Enterprise DNA runs it for you.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=smartabase).

It is built for a New Zealand or Australian high-performance programme: a provincial or pro side, a national or state squad, an academy, a university or school team. Squads, athletes and staff; sessions with each athlete's minutes and RPE; the morning wellness form; injuries with their graded return to play and the doctor's clearance; testing batteries; and safety checks for staff working with under-18s. The words are the words a performance department already uses: availability, load, the ratio, modified, stage 4, cleared.

**Nothing sends or talks to another system on its own.** Availability notes, return-to-play plans and athlete check-ins are drafted here and a person sends them. The gates are real, though: a concussed athlete cannot be moved to full contact before their symptom-free days are done, or to competition before their return date; a physio cannot clear a concussion; return-to-play stages go in order, a day apart; and a squad session never logs load for an athlete who is out.

```
/morning-screen            before training: who is out, whose wellness is down, who is spiking
/availability              available, modified and out, squad by squad
/log-session               a session and the squad's RPE, with each exception
/loads                     7-day load against the 28-day average, spikes and drops
/concussion                the stages, the symptom-free days, the earliest dates, the doctor's clearance
/rtp                       every open injury: next stage, contact and play dates, returns overdue
/testing                   latest results against the previous, judged against the smallest worthwhile change
/compliance                eight rules: consent, concussion dates and clearance, stage pacing, repeat concussions, safety checks, injury records
/weekly-review             the Monday review, written from three commands
```

Every concussion date reads one view, `concussion_status`: the injury day, the first symptom-free day, whether the athlete is an adult with daily medical cover, and the rules in settings. The return-to-play board, the gates on `stage` and `clear`, the compliance check and the availability report can never disagree about when someone may play.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats and no per-product pricing: every coach, physio and analyst can ask. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/athlete-management-for-claude-code.git
cd athlete-management-for-claude-code
npm install
npm run demo
```

`npm run demo` creates the database and loads Southern Lakes Rugby (a made-up provincial union with a men's squad with daily medical cover, a women's community squad and an under-18 academy: 23 athletes, six weeks of sessions and RPE, four weeks of wellness, ten injuries and two rounds of testing; with a concussed player back in contact training and a match too early and cleared by a physio, a player on his third concussion in a year whose stages were rushed, two athletes with no health consent, an academy coach whose police vet has expired and a strength coach with none, an ankle sprain with no mechanism recorded, a lock spiking after a long hamstring injury, a flanker ten points under his normal wellness score on five hours' sleep, three forms missing this morning, and a first five whose jump is down 4.5 cm), then prints today in four lines, availability and the compliance check.

Then open the folder in Claude Code and type:

```
/morning-screen
```

Try `/attention`, `/loads`, `/rtp`, `/testing`, `/weekly-review`. When you are ready for real data, delete `.data/` and start with `/import`.

Fill in the "Who this is for" block in [CLAUDE.md](CLAUDE.md), put your name, logo and colours in [brand.json](brand.json), and set your thresholds and your sport's concussion numbers (`npm run athletes -- settings --acwr_high=1.5 --community_min_days=21`) so the checks and reports carry them.

## Your first hour: ten things to ask for

1. "Who can train today, and who do I need to talk to before the session?"
2. "SEN did 75 minutes contact field, RPE 7 for everyone, Will did 40 minutes at 5."
3. "Whose wellness is well below their normal this morning, and why?"
4. "Who is on a load spike this week?"
5. "Ben is symptom free from Monday. When can he do contact, and when can he play?"
6. "Kate's GP has cleared her: record it." (and watch what happens when it was the physio)
7. "Draft the availability note for Saturday's team."
8. "Who has gone backwards on the jump since pre-season?"
9. "Where have we lost the most days to injury this season?"
10. "Bring in this Smartabase wellness export." 

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

| Command | What it does |
|---|---|
| `/morning-screen` | Before training: out and modified, wellness flags and missing forms, load spikes, who to talk to |
| `/attention` | Everything that wants a decision today, worst first |
| `/weekly-review` | The Monday review, written from stats, attention and loads |
| `/availability` | Available, modified and out by squad, with expected returns |
| `/wellness` | This morning's forms: missing, below the athlete's own normal, short sleep |
| `/log-session` | Record a session and the squad's RPE, then each athlete's exception |
| `/loads` | Acute and chronic load, the ratio, week-on-week change, spikes and drops |
| `/log-injury` | A new injury with body area, mechanism, activity and expected return |
| `/concussion` | Stages in order, symptom-free days, the earliest dates, the doctor's clearance |
| `/rtp` | The return-to-play board |
| `/injuries` | The injury register, open or the whole season |
| `/testing` | Latest results against the previous and the smallest worthwhile change |
| `/athlete` | Everything on one athlete |
| `/log` | A note on an athlete's record |
| `/compliance` | The eight rules in `docs/compliance.md`, every breach with its source |
| `/draft-availability-report` | The note to the head coach or selectors before a match |
| `/draft-rtp-plan` | The return-to-play plan for an athlete (and parents for under-18s) |
| `/draft-check-in` | A short message to an athlete whose wellness or load is flagged |
| `/documents` | Branded availability reports, return-to-play records and testing reports |
| `/view` | Read-only pages: this week, training load, the injury register |
| `/new-view` | Add a page from a plain-language description |
| `/import` | Bring athletes, wellness, RPE, injuries and tests across from Smartabase exports |
| `/export` | Every record to CSV |
| `/customise` | Add a field, change a threshold or a rule, in plain language |

## Ten questions answered from your own records

Every one is a real command or query on the demo data today.

1. Who is out, who is modified, and when is each expected back? (`availability`)
2. Whose wellness this morning is four or more points under their own 28-day normal? (`wellness`)
3. Who is on a load spike against their four-week average, leaving out athletes who are out? (`loads`)
4. For each concussion, what is the earliest day for contact training and for competition under the rules that apply to that athlete's age and squad? (`rtp`)
5. Which concussed athletes trained in contact or played before those dates? (`compliance` R2 and R3)
6. Which concussions were cleared by someone other than a doctor? (`compliance` R4)
7. Who has had three concussions in twelve months? (`compliance` R6)
8. Which staff working with under-18s have no current safety check? (`compliance` R7)
9. Whose test results went backwards by more than the squad's smallest worthwhile change? (`testing --changes`)
10. Where are we losing days to injury, by body area and mechanism? (`view injuries`)

## Instead of Smartabase

Export each form (athletes, wellness, RPE, injuries, tests) from Smartabase to CSV, then run the import with a test run first:

```bash
npm run athletes -- import smartabase athletes.csv --kind=athletes --squad=SEN --dry-run
npm run athletes -- import smartabase wellness.csv --kind=wellness
```

Every Smartabase site builds its own forms, so column names vary: the import recognises the common ones, and [docs/replace-smartabase.md](docs/replace-smartabase.md) lists them, says what maps and what does not carry over. Running an import twice adds nothing twice.

## Architecture

```
athlete-management-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis, the rules (compliance.md) and the migration guide
  views.json, documents.json  the read-only pages and the branded documents
  examples/                 Smartabase-shaped CSV exports the import and the tests use
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Athlete Management for Claude Code for your business, migrates your Smartabase data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=smartabase)
- Read more: [enterprisedna.co/omni/instead-of/smartabase](https://enterprisedna.co/omni/instead-of/smartabase?utm_source=github&utm_medium=readme&utm_campaign=smartabase)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
