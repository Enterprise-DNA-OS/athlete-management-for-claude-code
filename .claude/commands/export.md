---
description: Export every record to CSV files, one per kind of record, for a backup, an auditor or another tool.
---

Run `npm run athletes -- export` (or `--out=<folder>`). It writes squads, staff, athletes, sessions, session loads, wellness, injuries, return-to-play stages, tests, test results and notes as CSV to `exports/<date>/`. Say where the files are and how many rows each has. The `exports/` folder is in `.gitignore`: health information never goes into git.
