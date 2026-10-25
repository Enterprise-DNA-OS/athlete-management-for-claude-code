# Athlete Management for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| Who can train, who to talk to before training | `/morning-screen` |
| What needs doing, what is wrong, what is late | `/attention` |
| The Monday review | `/weekly-review` |
| Who is available, modified, out | `/availability` |
| This morning's wellness forms | `/wellness` |
| A session, RPE, minutes | `/log-session` |
| Training load, spikes, the ratio | `/loads` |
| A new injury or illness | `/log-injury` |
| A concussion: stages, symptom free, dates, clearance | `/concussion` |
| The return-to-play board, other injuries' stages | `/rtp` |
| The injury register, days lost | `/injuries` |
| Test results, who improved, who went backwards | `/testing` |
| One athlete's whole record | `/athlete` |
| A note on an athlete | `/log` |
| Are we following the rules | `/compliance` |
| The availability note for the coach | `/draft-availability-report` |
| A return-to-play plan for an athlete or parents | `/draft-rtp-plan` |
| A message to a flagged athlete | `/draft-check-in` |
| Reports to print or attach | `/documents` |
| A page to look at | `/view`, `/new-view` |
| Data from Smartabase | `/import` |
| A backup or a file for someone else | `/export` |
| Change a field, threshold or rule | `/customise` |

If an ask fits nothing here, run the CLI directly (`npm run <cli> -- --help`) and then propose a new command for it.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.
- Health information is private. Never paste an athlete's medical detail into anything outside this folder unless the operator names who it is for. Exports go to `exports/`, which git ignores.
- The doctor decides return to play. Never move a concussed athlete forward, clear them, or use `--force` on a gate unless the operator says the doctor told them to, and log why.
- A wellness or load flag is a reason to talk to an athlete, never a diagnosis.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis, the rules with their sources (`compliance.md`) and the guide for moving off Smartabase.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/smartabase
