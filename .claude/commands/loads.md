---
description: Training load by athlete: the last 7 days against the 28-day weekly average (the acute to chronic ratio), the week-on-week change, and who is spiking or under-loaded.
---

1. Run `npm run athletes -- loads --json` (`--squad` to narrow).
2. Load is session RPE: minutes times the athlete's rating of how hard it was (0 to 10), in arbitrary units (AU).
3. Lead with spikes (ratio over the setting, 1.5 by default), then week-on-week jumps, then available athletes under-loaded. Athletes who are out are not flagged.
4. Put a spike in context before anyone acts on it: an athlete back from injury always spikes against a low four-week average. Check `npm run athletes -- athlete "<name>" --json` for a recent clearance.
5. Thresholds live in settings: `npm run athletes -- settings --acwr_high=1.4 --acwr_low=0.8 --week_change_pct=15`.
