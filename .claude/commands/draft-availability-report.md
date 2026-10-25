---
description: Draft the availability note for the head coach or selectors before a match: who is available, modified and out, and the earliest dates for anyone coming back.
---

1. Run `npm run athletes -- availability --squad=<squad> --json` and `npm run athletes -- rtp --json`.
2. Write `drafts/availability-<squad>-<date>.md`: available (by position), modified (what they can and cannot do), out (injury in plain words and the expected return). For a concussion, the earliest play date and that it needs a doctor's clearance.
3. Medical detail to the minimum the coach needs: "hamstring, back in two weeks", not the scan report.
4. Never send it. A person reads it and sends it. For a branded copy: `npm run docs -- availability-report`.
