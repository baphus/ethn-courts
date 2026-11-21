# Autonomous local integration — 2026-11-21

## Scope and boundaries

User requested continued implementation until completed or externally blocked. Local code and disposable PostgreSQL only; no hosted migrations, real accounts/payment submissions, mail delivery, package installation, deployment, or production-data access. Original `paddle-culture` status was checked clean.

## Integrated additions

- Completion/no-show API and booking-detail controls, plus authenticated bounded operations cron; completion includes confirmed extension end times and waits for pending extension review. Scheduler is not provisioned.
- Real information-only Open Plays with court allocations, public/staff pages and versioned edits; generic maintenance release cannot release event blocks.
- Paid manual sales with separately dated record corrections; owner finance now includes accepted booking/extension receipts, sales, signed dated sales corrections, expenses and same-day expense corrections. These are record corrections, not refunds or cash-return events.
- Held walk-in reservation before payment, frozen quote/merchant, actor-bound confirmation, overnight end date and current-account live-hold recovery. Confirm writes require full payment, live hold and unchanged acknowledged frozen amount.
- Persistent per-recipient inbox, durable read state and authenticated inbox backstop. Inbox links are allowlisted. Optional Web Push code, permission controls, worker and durable retry are implemented using the planned vetted dependency; disabled without operator VAPID configuration. Mocked delivery tests do not establish real-device delivery.
- Owner court creation (inactive until configured) and validated timing-policy changes that reject active inventory.
- Cross-module expiry helper releases only expired extension holds under shared court locks; calendar, hours and tracking include extension occupancy/history.

## Evidence and limits

Focused modules have dated individual checks. Integrated PostgreSQL chain 0001–0026 passed in `ethn-integrated/run-1795217263453/`; extension evidence supplement 0027 and optional push 0028 also passed the final 18-suite isolated regression. Do not extrapolate individual module fixtures into a full hosted user journey.

Final parent regression after all supplements: 358 total, 332 passed, 26 conditional skips, 0 failures; typecheck/build/diff-check exit 0. All 18 selected isolated database suites separately passed with no DB skips against the full 0001–0028 chain, runner exit 0; evidence `ethn-db-5uLvOH/` and `ethn-all-db-28-final.log` under approved temporary directory. Runtime npm audit exit 0; full audit retains four moderate development-tool advisories. Temporary servers and database clusters started for verification are stopped.

Synthetic UI fixture report: `2026-11-21-local-ui-fixtures.md`. Observer reviewed populated dashboard/calendar/finance/Open Plays/sales/inbox images; activity mobile table needed clearer scrolling/focus/padding, now adjusted. Fixtures omit authenticated shell/fonts and do not prove authorization, real payment receipt, uploads or production parity.

Temporary disk exhaustion was caused by retained stopped disposable clusters. Removed 110 stopped test data directories only, preserving logs/results and active PostgreSQL instances; recovered approximately 5.6 GB. New harnesses must stop their own servers and remove only their own inactive data directories. No user or hosted database was deleted.

## Still external

Real venue configuration, approved current hosted schema/migration plan, production hosting/domain and pooling, SMTP/scheduler setup, independent backup/restore and retention, push dependency/VAPID/device delivery, and deployment approval. No production-readiness claim.
