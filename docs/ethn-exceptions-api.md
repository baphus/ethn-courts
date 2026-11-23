# Late-payment exception review — removed

Removed 2026-11-22. The staff review screen at `/admin/exceptions`, queue/detail/review APIs under `/api/ethn/admin/exceptions`, and review service no longer exist. These URLs now return 404. Sidebar navigation and exception notification generation are removed; existing exception notifications are excluded from inbox reads and push delivery.

Existing payment records, historical audit events, and ordered schema migrations remain intact. Late proof submission still records an unaccepted payment against an expired hold without restoring allocations. This safety behavior is not a staff exception-review workflow; no refund, acceptance, or slot recovery is introduced.

No database migration or hosted data change is required or performed for this removal. Earlier plans and dated checks describing exception review are historical evidence, not current feature support.
