# Court details and pictures — 2026-11-22

## Scope

Court setup now groups photo, description, name, active state and weekly windows/rates on court cards. Edit details uses an owner-only multipart PATCH at `/api/ethn/admin/courts/:id`. Fields are `name`, `description`, `version` and optional `photo`. GET courts includes a separate details `version` and `photoVersion` (`0` means no photo). Conflicts return 409 and preserve form edits. Details saves preserve unsaved schedule edits. The settings version advances to protect older settings writers; the client advances its schedule snapshot version only when the returned previous version matches, so unrelated concurrent changes still conflict.

Public availability includes description and photoVersion. Existing booking photo dialog reads the saved photo and description. `/api/ethn/courts/:id/photo` serves only re-encoded WebP bytes with no-store/nosniff; court photos are public even for inactive courts. Never upload private material as court photos.

Input accepts JPEG/PNG/WebP up to 5 MiB, with bounded multipart streaming, actual decode/format verification, 20-million-pixel ceiling, metadata stripping, maximum 1600×1200 output and 1 MiB stored size. Uses sharp already installed by Next.js, no new dependency. Photos are bytea in court rows, not proof Storage; one transaction replaces details/photo and records audit without image or description content. Failed writes preserve old photo. This deliberately supports one photo per court, not galleries.

## Upgrade gate

`db/ethn/0029_court_details.sql` adds photo/details_version, column grants and a change trigger that also catches existing settings name edits. Apply only through separately approved migration plan after preceding ETHN migrations. No database, hosted service or Storage bucket changed in this task. Existing runtime requires this upgrade for courts listing and availability. Verify effective restricted-role grants/RLS and trigger behavior on disposable database before hosted upgrade.

## Evidence

- `npx --no-install tsc --noEmit --incremental false`: exit 0.
- `npm run build`: exit 0.
- `npm test`: exit 1, 365 pass, 25 skipped, 2 failures in existing `admin-dashboard-ui.test.ts` and `no-instant-slicing.test.ts`, outside modified court files. Logs: `%TEMP%/opencode/ethn-court-tests.log`.
- New court tests exercise validation, real decode/re-encode, spoofed/oversized rejection, owner check, stale version and rollback. SQL is mocked; not proof of effective database grants or applied schema.
- No browser testing authorized or run. Responsive appearance, authenticated uploads and actual database persistence remain unverified.
