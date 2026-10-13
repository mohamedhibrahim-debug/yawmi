# Yawmi (يومي) — prototype spec

Source prototype: https://yawmi-home-prototype.yuri-07.chatgpt.site
This file describes the prototype as it exists today. It is the input for planning the real implementation.

## Product
A calm, Arabic-first (Egyptian dialect, feminine address, RTL) daily planner for household work.
Target user: a woman running a home, often with kids. Tone is gentle and explicitly non-judgmental
("time tracking is for planning, not for grading your day"). Mobile-first; desktop has a side nav, phone has a bottom nav.

## Screens
1. **Today (اليوم).** Week strip (Sat..Fri), today's task list, "new thing" button, starter templates
   (washing machine 10 min effort + wait, cook lunch 45, study with kids 40, time for myself 20),
   "space of your day" card (planned effort vs. available capacity, counts per period), "time for yourself" card.
2. **Routine (روتيني).** Recurring tasks on chosen weekdays. Editing a routine only affects future, not-yet-materialized copies; disabling never deletes already-added tasks.
3. **My log (سجلّي).** Per-day: tasks done, minutes tracked, remaining tasks; per-task expected vs. tracked minutes, manual time adjustment.
4. **Onboarding dialog.** Optional name, effort capacity for the rest of today (default 180 min), start time for arranging tasks (default 09:00).
5. **Settings / export / import / install (PWA-like install button).**

## Task model (from domain.mjs)
Task: id (uuid), title (<=120), category (home|food|kids|self|other), effort minutes (1..480), wait minutes (0..720),
priority (bool), period (morning|afternoon|evening), notes (<=1000), date & originalDate (YYYY-MM-DD local),
routineId|null, status (todo|done|deleted), completedAt|null, order.
DB: { version, revision, settings{name<=40, capacity 15..960, start HH:mm, onboarded}, tasks[], routines[], sessions[{taskId,start,end}], waits[{taskId,start,end}], active{taskId,start}|null }.

## Behavior
- Actions: start (stops any other active timer), complete (toggle), move to another date ("for tomorrow"), delete (soft), begin wait (washing cycle running; ends at now+wait).
- Only one active timer at a time; starting/completing/moving/deleting a task stops its timer and clears its wait.
- **Plan ("arrange my day")**: todo tasks not currently waiting, sorted by period, then priority, then order.
  Cursor starts at settings.start; afternoon tasks never start before 12:00, evening before 17:00; 10-min gap between tasks.
  A task is flagged "over" when cumulative effort exceeds capacity or its end+wait passes midnight. Wait time does not block the next task.
- Routines materialize into a day only when that day is opened in the UI.
- Tracked time per day = sessions clipped to local midnight boundaries.
- Export = JSON envelope {app:'yawmi-home', exportedAt, data}; import validates every field strictly (ids, ranges, referential integrity, one active timer, no duplicate routine occurrences).

## Current technical shape
- Static site: index.html + app.mjs (UI, ~30 KB) + domain.mjs (pure logic, ~7 KB). No framework, no build step.
- **All data in one localStorage key** (`yawmi-home-app-v1`). No network calls, no accounts, no backend.

## Known gaps found while testing the prototype
1. Closing onboarding with X leaves `onboarded=false`, so the dialog reappears on every visit.
2. Data is per-browser only: cleared storage = data loss; no sync between phone and laptop.
3. No notification when a wait (e.g. washing cycle) ends — the app knows the end time but cannot alert.
4. Routine tasks appear only after their day is opened, so nothing can preview or remind about upcoming routine work.
5. Single user per household; no sharing with a partner or kids.
