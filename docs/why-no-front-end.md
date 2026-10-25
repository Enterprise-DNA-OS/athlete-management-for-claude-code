# Why there is no front end

Smartabase is a database with a subscription. The records underneath it are ordinary: athletes, sessions, a wellness form a day, injuries, test results. What you pay for is the layer on top that lets staff who do not write queries get at them: form builders, dashboards, reports, the athlete app.

That layer used to be the whole product, because talking to a database was hard. It is not hard any more. Open this folder in Claude Code, describe what you want ("who has been under 6 hours' sleep three nights this week and is on a load spike?"), and it writes the query, runs it, and explains the answer. A question no dashboard was built for still gets an answer.

## What you gain

- **Better answers.** A dashboard shows what someone built a chart for. Here the head of performance asks their own question and gets it answered from the records.
- **No seats.** Every coach, physio and analyst can look. The bill does not grow with staff or athletes.
- **Your data in your Postgres.** Plain tables you own. Health information stays in a database you control, backed up how you choose.
- **A programme that matches you.** When the wellness form or the testing battery changes, you add a column or a command. You do not wait for a form builder.

## What you give up

- **The athlete's phone form.** Athletes fill in wellness and RPE on their phones in Smartabase. Here staff record it, or it comes in from a form you already use. A phone form that writes straight into this database is a small build, and it is one of the first things Enterprise DNA adds for a programme.
- **Drag-and-drop dashboards.** Pages here are rendered from queries (`npm run view`) and are read-only.
- **A vendor help desk.** This is open source. Enterprise DNA supports the installed version for programmes that want someone to call.

## Who this fits

Programmes whose staff already use Claude Code, or would rather ask than learn another interface: provincial and pro sides, academies, university and school high-performance teams. If you need the answers more than the screens, this is cheaper, faster and yours.

Installed and run for you: https://enterprisedna.co/omni/instead-of/smartabase
