# Moving off Smartabase

Smartabase (now called Teamworks AMS) is built per organisation: your administrators built your own forms, so your wellness form, your RPE form and your injury form have the column names your team chose. That is why the import reads a CSV per kind of record and recognises the common names below, and why a test run comes first.

## 1. Export from Smartabase

For each form, open its table or report view, choose the date range (a season is a good start), and export to CSV. You want five files:

| File | One row per | Columns this import recognises |
|---|---|---|
| Athletes | athlete | `Username`, `First Name`, `Last Name` (or `About` / `Name`), `Group` or `Squad`, `Position`, `Date of Birth`, `Consent Date` |
| Wellness | athlete per day | `About` (the athlete's full name) or `Username`, `Date`, `Sleep Hours`, `Sleep Quality`, `Fatigue`, `Muscle Soreness` or `Soreness`, `Stress`, `Mood`, `Comments` |
| RPE | athlete per session | `About`, `Date`, `Session Type`, `Session`, `Duration` or `Minutes`, `RPE` or `sRPE`, `Total Distance`, `HSR` |
| Injuries | injury | `About`, `Date of Injury`, `Body Area`, `Side`, `Injury Type`, `Mechanism`, `Activity`, `Diagnosis`, `Status`, `Expected Return`, `Date Cleared`, `Notes` |
| Tests | result | `About`, `Date`, `Test`, `Result`, `Unit` |

Dates can be `DD/MM/YYYY` (with or without a time after them) or `YYYY-MM-DD`. If a column has another name in your export, rename the header in a copy of the file. The examples in `examples/` show each shape.

## 2. Set up your squads

The import puts athletes into squads that already exist. Ask Claude Code to add yours ("add a squad WMN, Southern Lakes women, rugby union, community level, no daily medical cover") or edit the demo ones. Delete `.data/` first to start from an empty database.

## 3. Run the import, test run first

```
npm run athletes -- import smartabase exports/athletes.csv --kind=athletes --squad=SEN --dry-run
npm run athletes -- import smartabase exports/athletes.csv --kind=athletes --squad=SEN
npm run athletes -- import smartabase exports/wellness.csv --kind=wellness
npm run athletes -- import smartabase exports/rpe.csv --kind=rpe
npm run athletes -- import smartabase exports/injuries.csv --kind=injuries
npm run athletes -- import smartabase exports/tests.csv --kind=tests
```

Every import runs inside one transaction: a `--dry-run` shows the counts and every problem line, then saves nothing. Running an import twice adds nothing twice (a wellness form is one per athlete per day, a session load one per athlete per session, a test result one per athlete per test per day, an injury one per athlete per day per kind).

If your wellness form scores 1 as best and 5 as worst, add `--reverse`: here 5 is always best.

## What maps

- Athletes keep their Smartabase username as `external_id`, so later files can match on it. New codes follow the squad (A011 after A010).
- RPE rows create the session for that squad, date and title if it does not exist, and the load is minutes times RPE.
- Injury types are read for the kind (concussion, muscle, ligament, tendon, bone, joint, illness; "strain" is muscle, "sprain" is ligament, "fracture" is bone). A date cleared marks the injury cleared; a status containing "modified" puts the athlete on modified training.
- A test the system does not know yet is added as higher-is-better, and the import says so. Fix the direction for times and skinfolds.

## What does not carry over

- **Return-to-play stages and who cleared each injury.** Smartabase forms for these vary too much to map blind. Re-enter open injuries' stages with `/concussion` and `stage`; closed ones keep their cleared date.
- **GPS and wearable feeds.** Distance and high-speed running come across when they are columns in the RPE export. A live feed from a GPS vendor is a connection Enterprise DNA builds into your version.
- **Dashboards, report designs and the athlete app.** They are screens, not records. Your questions go to Claude Code; the athletes' own phone form is something Enterprise DNA builds into your version.
- **Attachments** (scans, letters). Keep them where they are and record the reference in the injury notes.

Check the import against Smartabase before you switch: athletes per squad, injuries this season, the last four weeks of load for a few athletes. Then run both side by side for a week.
