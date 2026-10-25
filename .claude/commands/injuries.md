---
description: The injury register: open injuries, or the whole season with days lost by body area and mechanism.
---

1. Open injuries: `npm run athletes -- injuries --json`. The season: `npm run athletes -- injuries --all --json`.
2. One injury in full: `npm run athletes -- injury <INJ-number or name> --json`.
3. For "where are we losing days", group the season's injuries by body area, mechanism and activity and sum days out. `npm run view -- injuries` renders the same as a page.
4. Injuries missing a body area, mechanism or activity are listed by /compliance (R8). Fill them in before any season report.
