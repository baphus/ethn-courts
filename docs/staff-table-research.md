# Staff table research: Jira-style search and pagination

Research and confirmed scope, 2026-11-25. The current-behavior section describes the baseline before implementation.

## Confirmed scope

- **Bookings:** Search above results. Keep typed search terms out of the address bar and retain them while paging. Status dropdown uses checkboxes, updates on check, stays open during selection, and matches any checked status. No selection means all eligible statuses. Keep Play date Apply. Separate Current / Archived / All, default Current; mark archived rows in All. Keep newest booked first and existing details and actions. Clear filters resets statuses, dates, archive view and page without clearing search; search clears separately.
- **Activity history:** Show exact Booking ID search above results (submit with Enter), keep Action single-select, and preserve Activity date validation. Do not change owner-only access.
- **Finance → Expenses:** Show title search beside expense filters. Keep Finance date scope, owner-only access, and existing expense actions.
- **All three:** Use server-side pages of 20, with compact numbered navigation, Previous/Next, and result range and total. Reset to page 1 when search or filters change. No bulk actions or permission changes.
- **Styling:** Keep all three tables compact and readable. Use existing admin components and typography; reduce excess padding and gaps rather than shrinking text or interactive targets. Keep search, filters, and paging easy to scan. Let controls wrap on narrow screens and keep keyboard focus visible.
- **Out of scope:** Sales, Owner access, Notifications inbox, schedule grids and dashboard previews. These are not part of the three-table rollout.

## Current ETHN behavior

- **Bookings** (`src/app/admin/bookings/bookings-view.tsx`, wired through `booking-list.tsx`): guest/contact/booking-ID search already debounces for 300 ms; search, filters, and page are URL-backed. Status is single-select and buried with play-date range behind an Apply/Reset popover. Archive state is parsed and sent to the API but has no visible control in this view. Server-driven pagination uses 20 rows and Previous/Next; the result and footer are cleared while fetching. Details open in a dialog; occupancy is a separate grid. `/admin/payments` redirects here, so no separate payment table needs a parallel redesign.
- **Bookings API** (`src/lib/admin/ethn-booking-read.ts`): rejects repeated parameters, accepts only one status from seven staff-visible states, and defaults to non-archived records. Search and filters run before counting and paging. It already returns a total and allows page sizes up to 50 (page capped at 1,000). Status multi-select requires coordinated UI, URL, and API changes, not just a dropdown swap.
- **Activity** (`src/app/admin/activity/activity-log.tsx`): owner-only; search and filters applied from a form, with Previous/Next. Page and filters live in component state, unlike Bookings.
- **Staff access** (`src/app/admin/staff/staff-manager.tsx`): owner-only roster with Auth user ID, role, Enabled/Disabled state, and Edit. No search, filter, or pager. Enabled/Disabled are not booking statuses. If this is the target, first confirm whether volume warrants pagination.
- **Finance and other views**: expenses already have separate page controls; sales has its own table; dashboard Recent bookings is a preview, not a worklist. Occupancy and booking-creation schedules are grids. Do not impose the same toolbar or pager on every table.

## What to borrow from Jira

- [Jira's space List view](https://support.atlassian.com/jira-software-cloud/docs/search-for-work-items-in-a-project/) puts text search, field filters and sorting near results, with Clear filters. When an option list is long, users can type to find an option. [Jira's global search experience](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-new-jira-work-item-search-experience/) also offers preview, configurable columns, resizing, inline edit and export. Those are separate features, not prerequisites for better filtering.
- [Atlassian Dynamic Table](https://atlassian.design/components/dynamic-table/) and [Pagination](https://atlassian.design/components/pagination/) establish paging as a standard table pattern. They do not establish that every Jira list uses the same pager. Numbered pages are an ETHN option, not a claim about Jira behavior.
- For a short fixed status list, use a button-triggered dropdown with labeled checkboxes, not an ARIA `combobox` just because the control looks like one. The [WAI-ARIA combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) describes a single-select widget; labeled native controls follow the [W3C form-label guidance](https://www.w3.org/WAI/tutorials/forms/labels/). Keep focus visible, support keyboard operation, and return focus to the trigger on Escape/close as appropriate.

## Recommended first pass if Bookings is in scope

1. Put Search, Status and Play date immediately above the results. Show active selections and a clear action without reopening the dropdown. Keep search aligned with the results and independent from choosing statuses. Distinguish archived view from lifecycle status; preserve current default.
2. Checkbox picks are OR within Status (`Pending` or `Confirmed`) and AND with other filter groups. No picks means all eligible statuses, not no results. Keep dropdown open while checking several boxes. Recommend immediate application for statuses, while keeping explicit Apply for the date range. Seven options do not need their own search field.
3. Keep server-side pagination, default 20. Show a result range and total, e.g. `21–40 of 126`, plus Previous/Next; add a compact numbered pager if users need to jump. Reset to page 1 when search, filter, or page size changes. Preserve selected filters on page changes and keep results/pager layout stable during loading; recover if a booking action makes the current page empty. If sorting is added, sort the full filtered dataset on the server, not just the page.
4. Keep the current details action and booking permissions. Status checkboxes filter, never edit rows or select them for bulk actions. Preserve valid old single-status URLs if the API changes. Booking search can include contact data: existing URL behavior exposes typed terms to browser history, so do not frame those URLs as safe to share or add them to analytics.

## Other tables worth changing, ranked

1. **Activity history — next.** It already searches and pages on the server, but Booking UUID is hidden in the generic Filters popover and the current pager is Previous/Next only (`activity/activity-log.tsx`). Surface an exact Booking ID field with Enter/submit, put Action and Activity date beside it, and use the same range/count and numbered pager as Bookings. Keep date validation. Action is an event type, not a status; keep it single-select unless multi-action auditing is needed.
2. **Finance → Expenses — small follow-up.** It already has title search, filters and server-side pagination (`finance/finance-controls.tsx`, `finance/finance.tsx`). Surface title search beside expense filters and reuse the pager. Retain finance date scope and existing edit/correction actions. No booking-style status dropdown without a specific filtering need.
3. **Finance → Sales — separate scope.** The server returns at most 200 sales in the requested date range (`src/lib/admin/ethn-sales.ts`). If owners need a complete history, add server-side search and pagination before adding a pager to the UI; paging the current array would hide older records. Keep sale history and correction behavior unchanged. Confirm that owners need this before touching the API.

Leave Owner access alone unless roster size makes it hard to scan. Notifications is a recent inbox, not a historical search table. Keep schedule grids and dashboard previews out of scope.

No live browser session, visual audit, or runtime validation. Jira references are public first-party documentation; ETHN observations are from current source wiring.
