---
description: Bring athletes, wellness, RPE, injuries and test results across from Smartabase CSV exports, with a test run first.
---

Read `docs/replace-smartabase.md` first. Then, in this order (athletes first, everything else matches on them):

```
npm run athletes -- import smartabase <athletes.csv> --kind=athletes --squad=SEN --dry-run
npm run athletes -- import smartabase <athletes.csv> --kind=athletes --squad=SEN
npm run athletes -- import smartabase <wellness.csv> --kind=wellness --dry-run
npm run athletes -- import smartabase <rpe.csv> --kind=rpe --dry-run
npm run athletes -- import smartabase <injuries.csv> --kind=injuries --dry-run
npm run athletes -- import smartabase <tests.csv> --kind=tests --dry-run
```

1. Always `--dry-run` first and show the operator the counts and every problem line. Fix the file or add the missing squad before the real run.
2. If their wellness form scores 1 as best, add `--reverse` so 5 is best here.
3. Running an import twice adds nothing twice.
4. Columns differ between Smartabase sites because each organisation builds its own forms. If a column is not recognised, map it: copy the file, rename the header to one in `docs/replace-smartabase.md`, and run again.
