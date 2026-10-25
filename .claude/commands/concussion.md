---
description: Manage a concussion from the day it happens to the medical clearance: the stages in order, symptom-free days, the earliest contact and play dates, and a doctor's sign-off.
---

The rules are in `docs/compliance.md` (R2 to R6). This command follows them; the doctor makes the call.

1. If it is new: /log-injury with `--kind=concussion --mechanism=contact --activity=match|training`.
2. Each stage as it is done, in order, at least a day apart:
   `npm run athletes -- stage <INJ-number> <1-6> --by=<staff> [--on=YYYY-MM-DD]`
   Stages: 1 relative rest, 2 light activity, 3 aerobic and strength, 4 non-contact training, 5 full contact training, 6 return to competition. Stage 5 needs the symptom-free days done; stage 6 needs the competition date.
3. The first day free of symptoms at rest: `npm run athletes -- symptom-free <INJ-number> --on=YYYY-MM-DD`. It prints the earliest contact and competition dates:
   - adults 19 and over with a doctor or physio every day: 10 symptom-free days
   - everyone else: 14 symptom-free days before contact, and not before day 21 (injury day is day 0) for competition
4. Clearance is a doctor's: `npm run athletes -- clear <INJ-number> --by=<doctor>`. A physio clearing a concussion is refused.
5. Show the record: `npm run athletes -- injury <INJ-number> --json`, and `npm run docs -- return-to-play` for the printable record.

Never use `--force` unless the doctor has told you to, and record why with /log.
