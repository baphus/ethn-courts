-- DRAFT: fresh ETHN database only. Requires 0001-0010; independent of 0011 and safe after it.
-- Shared server role: the service must verify current enabled staff before locking or writing.
-- reviewed_at, reviewed_by and review_reason updates are already granted by 0008; no broader payment write grant.
-- Exception review records assessment only: status stays exception and booking stays expired.
create policy exception_review_payment on ethn.payments for update to ethn_checkout
  using (status = 'exception')
  with check (
    status = 'exception'
    and reviewed_at is not null
    and reviewed_by is not null
    and review_reason is not null
    and review_reason <> ''
  );
