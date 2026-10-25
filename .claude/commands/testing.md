---
description: Testing results: each athlete's latest against their previous, judged against the squad's smallest worthwhile change, and who has gone backwards.
---

1. Run `npm run athletes -- testing --json` (`--test=CMJ`, `--squad=SEN`, `--changes` for only real changes).
2. The smallest worthwhile change (SWC) is 0.2 times the spread of the squad's latest results. A change smaller than that is "no real change".
3. Report who got worse first, by test, then the biggest improvements. Remember the direction: a lower sprint time is better.
4. Add results: `npm run athletes -- add-result "<name>" CMJ 42.5 --on=YYYY-MM-DD`. A new test goes in the tests list first (ask Claude Code to add it).
5. Per-athlete reports: `npm run docs -- testing-report`.
