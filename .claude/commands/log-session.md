---
description: Record a session and the squad's RPE: one rating for everyone, or each athlete's own minutes and RPE after training.
---

The operator says something like "SEN did 75 minutes contact field today, RPE 7 for everyone, Will was 5 and only did 40 minutes".

1. Add the session and log the squad in one go:
   `npm run athletes -- add-session SEN --kind=field --title="Contact field" --minutes=75 --contact --rpe=7`
   Kinds: field, gym, match, conditioning, recovery, skills. A match is always contact. Athletes who are out are skipped; modified athletes are skipped for contact sessions and get half the minutes otherwise.
2. Then each exception: `npm run athletes -- rpe "Will Henare" 5 --minutes=40 --title="Contact field"`.
3. Read back the session: `npm run athletes -- sessions --days=1 --json`, and say who was skipped and why.

Use `--on=YYYY-MM-DD` (or `yesterday`) for a session that already happened.
