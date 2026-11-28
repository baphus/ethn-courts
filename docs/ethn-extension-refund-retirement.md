# Extension and refund retirement

Do not deploy this change until an authorized owner confirms there are no unresolved extensions in the deployment target. New extension holds are already retired; keep the current management workflow available until reconciliation is complete. This change does not reconcile records, deploy anything, or require a migration.

1. In the target environment, have an authorized operator check extension states using approved read-only access: `SELECT status, count(*) FROM ethn.extensions WHERE status IN ('held', 'pending') GROUP BY status;`. Do not share customer or payment data in deployment logs.
2. On an existing target, let unpaid holds expire using the pre-retirement workflow before rollout; the current runtime no longer sweeps extension holds. Resolve pending evidence and any money already received in the existing staff workflow. Pending requests do not expire via hold cleanup; do not delete them or release court time without reconciliation.
3. Recheck immediately before cutover. Both counts must be zero. If not, stop deployment and retain the existing workflow until reconciliation is complete.

After cutover, the management page is gone. The extension write endpoints return `410 RETIRED`. The booking refund endpoint again records eligible full external refunds. Staff-only historical reads, confirmed court time, existing records, and cash totals remain intact. Eligible cancellations and archive remain available. Finance hides the standalone refund card and trend line; historical receipts and refund adjustments remain in the calculations and XLSX export.
