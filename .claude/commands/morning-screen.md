---
description: The morning screen before training: who is out or modified, whose wellness form is missing or well below their normal, and who is on a load spike. One page for the head of performance and the coaches.
---

1. Run these three:
   ```
   npm run athletes -- availability --json
   npm run athletes -- wellness --json
   npm run athletes -- loads --json
   ```
2. Write it squad by squad, in this order:
   - **Not training fully today.** Out and modified, with the injury and expected return.
   - **Wellness.** Forms not in (name them, they need a nudge before the session), scores well below the athlete's own normal, short sleep, any item at 1 of 5. Quote the athlete's own comment.
   - **Load.** Anyone on a spike (ratio over the setting), anyone up sharply on last week, anyone available but under-loaded.
3. Finish with **Talk to before training**: at most five names, each with the one reason. An athlete flagged on wellness and load together goes first.

Never change anyone's availability from here. That is the medical team's call, recorded with /log-injury or /rtp.
