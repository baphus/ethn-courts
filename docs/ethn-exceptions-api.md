# Late-payment exception review — removed

Removed 2026-11-22. The staff review screen at `/admin/exceptions`, queue/detail/review APIs under `/api/ethn/admin/exceptions`, and review service no longer exist. These URLs now return 404. Sidebar navigation and exception notification generation are removed; existing exception notifications are excluded from inbox reads and push delivery.

Existing payment records, historical audit events, and ordered schema migrations remain intact. Late proof submission still records an unaccepted payment against an expired hold without restoring allocations. Owners receive a private inbox link to the evidence. Search by exact checkout ID without a status filter to find existing evidence. Check the receiving account and contact the customer to reconcile outside the app. This does not accept the payment, record a refund, or restore court time.

No database migration or hosted data change is required or performed for this removal. Earlier plans and dated checks describing exception review are historical evidence, not current feature support.
