---
description: The return-to-play board: every open injury with the stage it is at, what comes next, the earliest contact and play dates for concussions, and expected returns that have passed.
---

1. Run `npm run athletes -- rtp --json`.
2. Group by squad. For each athlete: the injury, days out, the next stage, the expected return. For concussions the contact-from and play-from dates are floors, not targets.
3. Call out expected returns that have passed with the athlete still out, so the medical team can update them.
4. Any stage or clearance the operator reports goes in through /concussion (or `stage` and `clear` for other injuries).
