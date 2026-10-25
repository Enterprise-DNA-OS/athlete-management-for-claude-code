---
description: Record a new injury or illness with what the injury register needs: body area, side, mechanism, activity, diagnosis, status and expected return.
---

1. Ask for anything missing before you write. The register needs body area, mechanism (contact, non-contact, overuse, illness) and activity (match, training, other); an injury without them breaks rule R8.
2. Run:
   `npm run athletes -- log-injury "<name>" --kind=muscle --area=Thigh --side=left --mechanism=non-contact --activity=training --diagnosis="Grade 1 hamstring strain" --status=out --expected=+14`
   Kinds: concussion, muscle, ligament, tendon, bone, joint, illness, other. Status: out or modified.
3. For a concussion, run /concussion next. Never give a concussed athlete an expected return earlier than the rules allow.
4. Read back the injury number and what is still missing.
