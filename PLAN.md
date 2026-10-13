# Plan: Yawmi production v1

Input: `SPEC.md` (prototype behavior). Goal: mobile-first Arabic RTL installable PWA, offline-first, optional account with cloud sync, push when a wait ends, onboarding fix, routines visible ahead of time. Household sharing is out of scope.

**Design principle (changed in round 2):** do not hand-roll a distributed sync protocol. Use a proven local-first sync engine, let the **server's commit order** decide conflicts instead of device clocks, and let **Postgres Row Level Security** enforce ownership. Every remaining guarantee below is either provided by that engine (and verified in M0) or enforced in the database.

## Architecture

1. **Stack.** Vite + TypeScript + Preact. Port the prototype rules to a pure `src/domain/` module shared by UI, upload handler, and tests.
2. **Sync engine: PowerSync over Supabase Postgres**, with a local SQLite database in the browser. The engine provides: local writes and their upload-queue entries in one local transaction; downloads applied atomically at complete server checkpoints, so clients never see a half-applied state (individual historical changes may be compacted, and prioritized sync applies one transaction per priority, so v1 uses a single priority); multi-tab sharing only where the platform supports it, since shared workers are off by default on Android, iOS, and Safari. M0 fixes and tests one specific SDK and VFS configuration on a low-end Android phone and on iPhone Safari. **M0 is a spike that proves each of these claims with fault-injection tests (crash mid-download, two tabs, offline for days); if any fails, we fall back to the simpler "manual backup to cloud" option in item 33 rather than building our own protocol.**
3. **Local-only by default.** First launch creates a local profile and `device_id` with no network call. Without sign-in, nothing is ever uploaded. The app works fully offline forever.
4. **Profiles are separate databases.** Each profile (local, or one per account) is its own SQLite file with its own upload queue. A profile has an immutable `generation` id; the upload worker is bound to one generation and checks, before each request, that the access token's subject equals that profile's account id. Switching profile stops the worker first (Web Locks), so queued data for account A can never be sent with account B's token.
5. **Single writer per device.** All writes go through one worker holding a Web Lock; each domain action is a read-modify-write inside one local transaction. Two tabs cannot both start a timer or produce interleaved edits.
6. **Local storage safety.** Request `navigator.storage.persist()`. On quota errors, show an error and keep the upload queue intact; the UI reports success only after the local commit. Schema changes ship as versioned, resumable migrations that keep the source data until verified. A new service worker activates only after all tabs reload (user-facing "update ready" prompt), and an app version refuses to open a database newer than it understands.
7. **PWA shell.** Manifest (`dir: rtl`, `lang: ar`), Workbox precache of the shell. Authenticated API responses are never cached.

## Server, authorization, validation

8. **No service role on the client path, and a workable privilege model.** Clients have no direct table write privileges. Uploads call narrowly scoped `SECURITY DEFINER` functions owned by a dedicated non-login role that is not the table owner and has no `BYPASSRLS`, so RLS (`user_id = auth.uid()`) still applies. Each function also checks ownership of every referenced task, run, wait, and subscription explicitly, pins `search_path`, and is executable only by `authenticated`. CI tests both that a real user's upload succeeds and that direct writes and cross-account writes fail.
8a. **Download authorization is a separate boundary.** PowerSync downloads do not go through RLS. Sync Rules (or Sync Streams) filter every bucket by the verified token's user id, exclude notification identities, audit, and admin tables, and are versioned in git. Every sync-configuration deploy is gated on two-account tests for initial download, incremental download, and a deleting or revoked account.
9. **Strict validation boundary.** Every operation type has a versioned schema (zod on the client, mirrored by Postgres `CHECK` constraints and function-level validation on the server). Only allowlisted fields are writable; `user_id`, ids, timestamps, and sync metadata are never client-settable. Ranges match the prototype's `validate()` (title ≤ 120, effort 1–480, wait 0–720, notes ≤ 1000, valid dates and IANA zones). Batch size and payload size are bounded. User text is always rendered as text, never HTML.
10. **Per-operation outcomes and dependencies.** Each upload op has an `op_id` unique per account plus a payload hash. The server returns `accepted`, `duplicate` (same id and same hash), `retry_later` (transient or unsupported-version failure), or `rejected` (permanently invalid, or same id with different content). Ops that depend on an entity (edits, timer runs, waits after a `create`) upload after their parent. If a parent is paused or rejected, its dependents are held with it as one recoverable group, while unrelated ops keep flowing. Rejected groups go to a local quarantine the user can see and export. Tests cover parent rejection, lost acknowledgments, and a crash between the server outcome and the local queue update.

## Conflict rules (server commit order, no device clocks)

11. **Fields merge independently.** A `set_fields` op carries the field version the device last saw. Consecutive local edits to the same field are coalesced in the upload queue into one op before upload, so a single offline phone never conflicts with its own earlier edit; a test edits one field repeatedly offline, restarts, and checks the last value survives. If that field changed on the server since then, the server keeps the newer value and returns a conflict; the app shows a gentle "changed on another device" note. Completing a task on one phone and editing its notes on another both survive because they touch different fields.
12. **Deletes have generations.** Each delete creates a new `delete_generation`. A `restore` must name the generation it undoes; an older restore is rejected. Edits made before a delete are ignored after a restore. Deleted ids stay as tombstones permanently (payload purged after 180 days).
13. **Timer runs.** Each run has a `run_id`. `timer_stop` closes that exact run; a second stop is a duplicate. If two offline devices both had open runs, the earlier one is closed at the later one's start. A run open longer than 8 hours is never auto-extended; the app asks the user to correct it. "One active timer" is guaranteed per device always, and across devices only while connected; the UI says so.
14. **Manual time corrections.** `adjust_time {id, task_id, day, delta_minutes}`, append-only and idempotent by id. A day's total is sessions clipped to that day plus that day's adjustments.
15. **Routines.** Routine edits are revisions ordered by server commit. A materialized occurrence (id `routineId + originalDate`) stores the exact revision id it was built from; if two devices materialize the same occurrence, the first to commit wins and the second becomes a duplicate. Later edits to the occurrence are normal field edits. Virtual previews for the visible week skip any original key that already has a materialized copy, a move, or a tombstone.

## Accounts

16. **Turning sync on.** Sign-in by email magic link or Google. New account: the local profile is copied into a new account profile through a durable transfer journal (source, destination, progress), and the active profile switches atomically only after the copy is complete. Existing account: the user picks merge (local data uploaded as ops into the account profile) or keep separate. The local source is kept until the user confirms everything arrived.
17. **Account deletion.** Mark the account `deleting` in the same transaction scope the upload functions check, so every later write is rejected; disable the Auth user and revoke sessions; stop notification jobs; then run idempotent, resumable cleanup. A permanent deletion record rejects stale tokens and retries. A device that syncs after deletion is told the account is gone and offered to keep its copy as a local profile.

## Wait notifications

18. **Consent and data are separate.** Enabling notifications registers a minimal notification identity that stores only wait jobs and the push subscription. If sync is off, the job label is generic ("وقت الانتظار خلص") and no task title leaves the device.
19. **Notification outbox.** Starting or cancelling a wait writes a local notification command in the same local transaction as the wait change. Commands upload even when sync is off. Each wait instance has a `wait_id`; a cancel names the `wait_id` it cancels, and the server derives job creation and cancellation in the same transaction as the wait state.
20. **Durable jobs.** `notification_jobs(wait_id, end_at, expires_at, status, lease_owner, lease_until, attempts, next_attempt_at, last_error, event_id)`. A `pg_cron` worker every minute expires overdue jobs first, then claims at most 200 due jobs with `FOR UPDATE SKIP LOCKED` and a 2-minute lease. Before sending it re-checks that the wait is still current and not past `expires_at`; each request has a 10-second timeout; it completes only if it still owns the lease. Errors are classified: 404/410 removes the subscription (permanent); 429 and 5xx retry with jittered backoff honoring `Retry-After`, but never past `expires_at`; other 4xx fail permanently. Terminal failures stay queryable for diagnosis.
21. **Honest delivery semantics.** Dispatch is retried at least once, but end-to-end delivery is not guaranteed: a push service may accept a message and still expire it undelivered. Push `TTL` is set to the seconds remaining until `expires_at` (end + 15 min). The service worker drops events past `expires_at`, keeps the last 50 handled `event_id`s in IndexedDB to suppress repeats, and uses `event_id` as the notification `tag`. Dispatch happens within about a minute of the due time; actual delivery time depends on the push service and the device. An offline cancellation cannot retract a push already queued, so the text is phrased to stay true ("الغسالة خلصت غالبًا").
22. **Subscriptions belong to the browser, not the profile.** The server stores one physical subscription per endpoint and separate bindings to profiles. Switching or signing out detaches the binding. Each push carries the profile `generation`; the service worker shows the task label only if it matches the active profile, otherwise a generic text.
23. **Abuse and capacity limits.** Endpoints must be HTTPS on known push services (Google, Mozilla, Apple, Microsoft); no redirects; outbound requests go through an egress allowlist. Key sizes are validated. Per identity: at most 5 subscriptions and 50 pending jobs, jobs at most 12 hours ahead, labels at most 60 characters. Inactive anonymous identities expire after 60 days. Aggregate limits sit on top: per-IP and global rate limits on identity registration and uploads, a global cap on pending jobs, fair bounded worker concurrency, and jittered client reconnect backoff.
24. **iOS.** Web Push only works when installed to the home screen (iOS 16.4+). Show a short install guide before asking permission; never ask on first load.

## Product fixes

25. **Onboarding bug.** Closing the dialog with X sets `onboarded = true` and keeps the defaults (180 min, 09:00).
26. **One planner time zone.** Settings hold an IANA `planner_zone`, synced. Day keys, recurrence, midnight clipping, and daily totals use it everywhere (Temporal polyfill). A device in another zone shows a notice and offers to change it. Tests cover both Egyptian DST transitions and travel.

## Operations

35. **Client and server compatibility.** Every upload carries `protocol_version` and the client's schema version. The server publishes the range it supports and keeps old handlers for the supported offline window (90 days). Server and sync-schema changes are additive and deploy first; new client writes are enabled only afterwards. A client outside the supported range gets `retry_later`, pauses uploads, keeps its queue, and asks the user to update, never a permanent rejection.
36. **Rollback.** Bundles are rolled back only to versions that can open the current local schema; local migrations are additive within a major version, so the previous bundle still reads them. When a rollback is impossible, we ship a forward fix instead. Every release rehearses old client with new server, new client with old server, and rollback after real writes.
37. **Backup and restore.** Supabase point-in-time recovery is on, with targets of RPO 5 minutes and RTO 4 hours, and restores are drilled quarterly into an isolated project with uploads and push dispatch switched off. After a server rewind, the restore runbook reinitializes PowerSync checkpoints so every client re-downloads. Clients keep a local journal of acknowledged ops for 7 days and re-upload them after a rewind, which is safe because `op_id` makes them idempotent. Deletion barriers and notification job state are restored from the same point; deletions recorded in the audit log after that point are re-applied before service resumes. Any acknowledged data that cannot be recovered is listed per account before reopening.
38. **Operational telemetry and alerts.** Content-free metrics only, labeled by release and protocol version: upload success rate, oldest pending op age, PowerSync replication and checkpoint lag, due notification job age, push accepted, failed, and expired counts, deletion backlog, and database WAL and disk headroom. Each has an alert threshold, a named owner, and a runbook covering pause, diagnosis, and recovery. A synthetic check every 5 minutes runs two test clients through edit, sync, and a push.
39. **Staged rollout and kill switches.** Feature flags are stable per account, so all of a user's devices are in the same cohort. Rollout goes 1%, 10%, 50%, then 100%, with a bake period and health gates from item 38 at each step. Separate server-enforced switches control new sign-ups, uploads, sync-configuration exposure, and push dispatch, so disabling a feature also stops server work already queued. While a switch is off, clients keep local edits and queued work and resume when it turns back on. Kill switches are rehearsed against old clients and running workers.
40. **Capacity budget.** Before M3, load-test a simultaneous reconnect of all clients plus a notification burst against explicit database, worker, and cost thresholds. Track the growth of tombstones and the op-id deduplication table, and size initial-sync volume per account.

## Migration, secrets, quality, rollout

27. **Import from the prototype.** The new origin cannot read the prototype's localStorage, so users import the prototype's JSON export. Tasks and routines keep their prototype ids. Sessions and waits have no ids, so they get `hash(taskId, start, end, occurrenceIndex)`, where the index distinguishes identical repeated sessions. The whole file is validated before anything is written, staged in a separate table, and activated in one transaction. Importing the same file twice changes nothing. The real prototype `domain.mjs` and a real export are added as fixtures first.
28. **Secrets and telemetry.** PowerSync, Supabase service, and VAPID private keys live only in server secrets, with a rotation runbook. Crash reports strip request bodies, tokens, push endpoints, and all task text. Built bundles are scanned in CI for secrets.
29. **Audit log.** Server records actor, account, op id, outcome, transfers, and deletion progress, without planner content, for 90 days, readable only by admins.
30. **Arabic and RTL.** Logical CSS properties, Arabic-Indic digits via `Intl.NumberFormat('ar-EG')`, self-hosted Arabic font subset. Tested on a low-end Android device and iPhone Safari.
31. **Tests.** Domain unit tests; sync tests with two devices, opposite sync orders, duplicates, and crashes at every boundary; cross-account security tests; Playwright E2E for offline edit and reconnect, account merge, import, and notifications.
32. **Milestones.** M0 sync-engine spike (item 2). M1 local-only PWA with import and product fixes. M2 notifications. M3 accounts and sync. Each ships behind a flag and is useful on its own.
33. **Fallback if M0 fails.** Replace live sync with manual "backup to cloud / restore on another device" using the existing export format. It removes every multi-device conflict at the cost of real-time sync.
34. **Out of scope for v1.** Household sharing, native apps, AI suggestions, analytics beyond crash reporting.

## Changelog

### After the loop: Codex fact-check and adversarial review

- **Item 2 overstated PowerSync guarantees.** Corrected: checkpoint consistency is for complete checkpoints, and multi-tab sharing depends on platform; M0 now pins one configuration on Android and iPhone Safari.
- **Item 21 claimed at-least-once delivery and a one-minute latency.** Corrected: only dispatch is retried; delivery is not guaranteed.
- **Item 11 made one phone conflict with its own offline edits.** Fixed by coalescing same-field edits in the upload queue.
- **Open decision, not applied:** the adversarial review recommends shipping v1 local-only with tested backup and restore, and deferring sync and server push. This changes product scope, so it is left for the owner.

### Round 3 (ops and SRE review): all 9 findings accepted

- **High, invoker functions plus revoked privileges make uploads fail.** Accepted. Item 8 now uses narrowly scoped `SECURITY DEFINER` functions owned by a non-owner role without `BYPASSRLS`, with explicit ownership checks and tests for both success and denial.
- **High, PowerSync downloads bypass RLS.** Accepted. New item 8a adds ownership-filtered Sync Rules with two-account deploy gates.
- **High, no client and server compatibility or rollback contract.** Accepted. New items 35 and 36 add protocol versions, additive deploys, a 90-day offline window, recoverable pauses, and rollback rehearsals.
- **High, no coordinated restore procedure.** Accepted. New item 37 adds point-in-time recovery, recovery targets, restore drills, checkpoint reinitialization, and client re-upload of acknowledged ops.
- **Medium, no operational telemetry.** Accepted. New item 38 adds content-free metrics, alerts, owners, runbooks, and a synthetic check.
- **Medium, flags without cohorts or server kill switches.** Accepted. New item 39 adds per-account cohorts, staged rollout, and server-enforced switches.
- **Medium, no aggregate limits or capacity budget.** Accepted. Item 23 adds aggregate rate limits; new item 40 adds load tests and growth tracking.
- **Medium, push retries without timing or classification.** Accepted. Item 20 adds error classes, jittered backoff with `Retry-After`, expiry before claim and send, and bounded claims and timeouts.
- **Medium, rejected parent ops cascade into dependents.** Accepted. Item 10 adds dependency-aware ordering, recoverable groups, and `retry_later`.

### Round 2 (security and data-integrity review): all 17 findings accepted, with one structural change

The main change is the design principle at the top. Most round-2 findings came from the hand-rolled sync protocol, so it is replaced by a proven engine, server commit order instead of device clocks, and RLS instead of a service role.

- **High, service role bypasses RLS.** Accepted. Item 8 runs uploads as the user under RLS and revokes direct access.
- **High, no validation boundary.** Accepted. Item 9 adds schemas, field allowlists, DB constraints, and size limits.
- **High, stale uploads after switching account.** Accepted. Item 4 binds the worker to a profile generation and checks the token subject; item 16 adds a transfer journal.
- **High, snapshot resync not consistent.** Accepted. Item 2 relies on the engine's checkpoint consistency, proven in the M0 spike, instead of a custom snapshot protocol.
- **High, poisoned clocks cannot be repaired.** Accepted by removal. Conflicts now use server commit order (items 11–15), so device clocks no longer decide anything.
- **High, account deletion can be undone by in-flight writes.** Accepted. Item 17 adds a deletion barrier, session revocation, and resumable cleanup.
- **Medium, multi-tab read-modify-write races.** Accepted. Item 5 adds a single writer per device.
- **Medium, restores can undo the wrong delete.** Accepted. Item 12 adds delete generations.
- **Medium, one bad op blocks the queue.** Accepted. Item 10 adds per-op outcomes, payload hashes, and quarantine.
- **Medium, notification commands not tied to wait changes.** Accepted. Item 19 adds a local notification outbox and `wait_id`-based cancels.
- **Medium, subscriptions per profile leak labels.** Accepted. Item 22 separates physical subscriptions from profile bindings.
- **Medium, Topic and tag overstate deduplication.** Accepted. Item 21 states at-least-once delivery, sets TTL, and deduplicates in the service worker.
- **Medium, push endpoints enable server-side requests and abuse.** Accepted. Item 23 adds an endpoint allowlist, egress control, and quotas.
- **Medium, import ids for sessions and waits undefined.** Accepted. Item 27 defines deterministic ids and staged activation.
- **Medium, no IndexedDB and service worker upgrade protocol.** Accepted. Item 6 adds version gates, resumable migrations, and quota handling.
- **Medium, secrets and telemetry leakage.** Accepted. Items 28 and 29 add secret handling, redaction, and an audit log.
- **Medium, concurrent routine revisions.** Accepted. Item 15 orders revisions by server commit and stores the revision on each occurrence.

### Round 1 (senior-engineer review): all 14 findings accepted

Clock skew and tie-breaks, late-commit cursor gaps, atomic and idempotent operations, tombstone resurrection, invented timer time, account upgrade boundaries, non-atomic push sends, stale pushes after cancellation, lost independent edits, server dependency for local use, routine conflicts, manual time adjustments, same-origin migration, and the planner time zone. Several of these round-1 fixes were later replaced by the round-2 design principle; the protections they required remain covered by items 2–27.
