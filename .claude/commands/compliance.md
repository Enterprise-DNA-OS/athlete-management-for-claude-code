---
description: Check the records against the rules in docs/compliance.md (health consent, concussion return dates and clearance, stage pacing, repeat concussions, safety checks for staff with under-18s, complete injury records) and report every breach with the rule cited.
---

1. Run `npm run athletes -- compliance --json`.
2. Report as a table: rule, count, each breach (athlete or staff member, what is wrong), the source. Breached first, clean last.
3. For each breach, the fix the operator can approve: record the consent, book the doctor, hold the athlete out of contact, renew the safety check, fill in the mechanism. Draft any message to `drafts/`, never send.
4. If a rule in `docs/compliance.md` is out of date (a sport's own concussion policy can be stricter), say so and stop. Do not guess. The operator confirms the rule, then you change the setting (`npm run athletes -- settings --community_min_days=...`) and the doc together.

Nothing here is medical or legal advice. The doc records the rules the programme has told the system to enforce, with sources, and this command checks the records against them.
