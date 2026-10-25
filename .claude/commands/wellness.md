---
description: This morning's wellness forms: who has not filled one in, and whose answers are well below their own normal, short on sleep or at 1 of 5 on any item.
---

1. Run `npm run athletes -- wellness --json` (`--all` for everyone, `--squad=WMN` for one squad).
2. Each item is 1 to 5 and 5 is best (sleep quality, fatigue, soreness, stress, mood). The score is out of 25. "Normal" is the athlete's own average over the last 28 days.
3. Report the missing forms first (a list the team manager can chase), then each flag with the athlete's comment.
4. To record a form someone gave verbally: `npm run athletes -- log-wellness "<name>" --sleep=7.5 --quality=4 --fatigue=3 --soreness=3 --stress=4 --mood=4 --comment="..."`.

A low score is a reason to talk to the athlete, not a diagnosis. Say that if the operator asks what to do about it.
