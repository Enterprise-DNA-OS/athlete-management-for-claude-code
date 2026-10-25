---
description: Who is available, modified or out today, squad by squad, with the injury and the expected return. The list the head coach picks from.
---

1. Run `npm run athletes -- availability --json` (add `--squad=SEN` for one squad).
2. For each squad give the count (available, modified, out), then the out and modified athletes with the injury and the expected return.
3. For any concussion, add the contact and play-from dates from `npm run athletes -- rtp --json`. Never give a return date earlier than those.
4. If the coach wants it on paper: `npm run docs -- availability-report` renders a branded report per squad in `docs-out/`.
