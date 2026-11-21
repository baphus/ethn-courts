# Admin redesign baseline

Research target: reduce page-level form clutter; keep each route centered on its main task, reveal uncommon filters/settings on demand, and use dialogs only for bounded actions. No backend or workflow changes implied.

## Reference

- Cal.com open-source booking list: [`apps/web/modules/bookings/views/bookings-view.tsx`](https://github.com/calcom/cal.diy/blob/main/apps/web/modules/bookings/views/bookings-view.tsx) — separates list/calendar views and delegates filtering/table state instead of mixing every management action into page body.
- Repository and license: [cal.diy](https://github.com/calcom/cal.diy), [MIT LICENSE](https://raw.githubusercontent.com/calcom/cal.diy/main/LICENSE). Reference interaction patterns only; do not import Cal.com auth, Prisma, or tRPC stack. If copying code verbatim, preserve MIT notice/attribution.
- Cal.com README describes project as self-hosted and not production-ready; this is not a recommendation to adopt its stack.
- [Easy!Appointments](https://github.com/alextselegidis/easyappointments) uses GPLv3; considered as a workflow reference, not a code-copy source.

Research limit: parent fetched the Cal.diy README, MIT license and booking-view source directly; this inventory's author did not perform further live-source verification or pin a commit. References are design evidence, not a verified complete baseline implementation. Parent subsequently pinned repository reference to commit `ae027bb70e694e2d2c44569f398d6cbcee0389b1` (GitHub API inspection); use commit-based links when documenting borrowed patterns.

## Active-route corrections

The table below includes historical file inventory; file presence does not establish active functionality. `/admin/bookings/new`, `/admin/users`, `/admin/revenue` and other retired redirects are not new redesign surfaces. Dashboard uses current ETHN operational reads, not legacy invite manager. Staff management grants existing Auth users access; do not add an invitation/account-creation workflow. Notifications are a private recipient inbox, not a broadcast/send console. Finance reports verified collections and dated record corrections, not formal revenue/profit. Preserve all current server authorization and approved exclusions.

## Current ETHN route map and redesign direction

| Route | Current implementation | Main task / primary action | Secondary actions and progressive disclosure |
|---|---|---|---|
| `/admin` | `src/app/admin/page.tsx`, recent booking cards/table, invite manager | Scan operational summary and open booking | Keep summary compact; invite action behind a small dialog, not a persistent form |
| `/admin/bookings` | `bookings/page.tsx`, `booking-list.tsx`, `complete-due.tsx` | Find and open a booking | Search prominent; status/date filters in compact filter row or dropdown; pagination retained. Due completion is a distinct action with confirmation, not a large form block |
| `/admin/bookings/new` | `bookings/new/page.tsx`; shared `components/admin/booking-create-form.tsx` | Create walk-in/manual booking | Dedicated focused flow is appropriate; don't squeeze multi-field booking creation into a tiny dialog |
| `/admin/bookings/[id]` | `bookings/[id]/page.tsx`; `booking-detail.tsx`, `booking-actions.tsx`, outcome controls | Review booking and decide outcome | Keep details readable; confirmation dialog for consequential status changes; extension evidence remains dedicated route |
| `/admin/calendar` | `calendar/page.tsx`, `components/admin/calendar-view.tsx` | See availability by date/court | Calendar owns primary area; date/court controls compact; booking details can open existing detail dialog/route |
| `/admin/payments` | `payments/page.tsx`, `payment-review.tsx` | Review payment queue and resolve item | Queue/list first; evidence and decision details in focused dialog or booking detail; confirm irreversible decisions |
| `/admin/exceptions` | `exceptions/page.tsx`, `exception-review.tsx` | Resolve exception queue | Prioritize exception rows and next action; filters tucked into dropdown; decision dialog only when a specific item is selected |
| `/admin/walk-in` | `walk-in/page.tsx` | Record walk-in booking | Focused booking flow; use shared booking form patterns, avoid an all-fields dashboard panel |
| `/admin/open-plays` | `open-plays/page.tsx` | Inspect/manage open plays | Queue/list first; no assumptions about workflows beyond existing handlers |
| `/admin/sales` | `sales/page.tsx`, `sales.tsx` | Record/review sales | Make existing main task explicit; secondary entry form opened on demand, preserve current functionality |
| `/admin/courts` | `courts/page.tsx`, `court-manager.tsx` | Manage court records | Table/list first; add/edit via dialog if bounded; avoid showing every edit form inline |
| `/admin/hours` | `hours/page.tsx`, `hours-manager.tsx`, `hours-editor.tsx` | Configure operating hours | Summary by day first; edit selected schedule in focused panel/dialog; preserve validation and unsaved-change handling |
| `/admin/timing` | `timing/page.tsx` | Configure booking timing | Show current values and one edit action; place fields in edit dialog, not permanent form |
| `/admin/settings` | `settings/page.tsx`, `owner-pricing.tsx` | Configure pricing | Current rates summary first; focused edit form; confirm/save state clear |
| `/admin/staff` | `staff/page.tsx`, `staff-manager.tsx` | Manage staff access | Staff list primary; invite/edit in dialog; revoke access requires explicit confirmation |
| `/admin/users` | `users/page.tsx` | Review users | Search/list primary; user actions contextual, avoid persistent broad controls |
| `/admin/finance` | `finance/page.tsx`, `finance.tsx`, `finance-controls.tsx` | Review financial performance | Summary/chart primary; date/export controls compact; avoid persistent multi-field filters |
| `/admin/revenue` | `revenue/page.tsx`, `revenue-range-filter.tsx`, exports/tables | Review revenue report | Report primary; date range and export secondary controls |
| `/admin/activity` | `activity/page.tsx` | Audit recent activity | Read-only timeline/table; filters tucked away |
| `/admin/notifications` | `notifications/page.tsx`, `push-controls.tsx` | Manage existing notification controls | Keep action explicit and compact; confirmation for sending/broadcast-like actions |
| `/admin/manual` | `manual/page.tsx`, `manual-contents.tsx` | Read operating guidance | Content first; no dashboard-style controls |

Navigation grouping recommendation: **Operations** (Bookings, Calendar, Payments, Exceptions, Walk-in, Open Plays, Sales, Notifications); **Owner settings** (Courts, Hours, Timing, Pricing, Staff, Users); **Reports & audit** (Finance, Revenue, Activity, Manual). Keep grouping within existing authorization; owner-only visibility must remain enforced server-side.

## House components / constraints

Existing reusable UI already includes `components/admin/admin-shell.tsx`, `admin-sidebar.tsx`, `admin-toolbar.tsx`, `admin-filter-dropdown.tsx`, `admin-pagination.tsx`, `confirm-dialog.tsx`, `booking-detail-dialog.tsx`, `page-header.tsx`, and `status-badge.tsx`. Prefer these over new abstractions. Current booking search already has search/status/from/to filters, abortable requests, loading/error/empty states and pagination; redesign presentation without weakening those states or query behavior.

Current user direction supersedes fork-era `DESIGN.md` green/oat branding: retain ETHN logo and restrained navy/orange identity, but use a neutral, consistent product workspace and one readable sans for admin controls/data. Cal.diy supplies interaction/layout reference, not a new backend or wholesale imported design system. No decorative athletic display typography in admin task headings.

Dialogs must have an accessible name, initial focus, keyboard close, focus return, and busy-state close protection. Dirty forms need a discard confirmation. Destructive or financially consequential actions need a clear consequence and explicit confirmation. Use a dedicated page/panel for long or multi-step forms; dialogs are for short, bounded edits and decisions. Preserve existing validation, error display, server authorization, and no-data-loss behavior.

Scope: documentation only. No browser use, dependency/tooling changes, data/API/auth changes, hosted access, or migrations.