-- Prepaid walk-in: staff records full payment at the desk, then the booking is confirmed.
-- Shared role still requires server-side staff authorization; this policy only constrains shape.
create policy walk_in_payment_insert on ethn.payments for insert to ethn_checkout with check (
  status = 'accepted' and verified_at is not null and verified_by is not null
  and collected_amount is not null and received_at is not null
  and ((method = 'cash' and accepted_reference is null and claimed_reference is null)
    or (method = 'gcash' and accepted_reference is not null and merchant_snapshot is not null))
);
