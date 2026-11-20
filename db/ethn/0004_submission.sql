-- DRAFT: fresh ETHN database, after 0001–0003. Shared role requires trusted ownership checks.
alter table ethn.payments drop constraint payments_check3;
alter table ethn.payments add constraint payments_review_check check (
  (status in ('rejected','exception') and reviewed_at is not null and reviewed_by is not null and review_reason is not null and review_reason <> '')
  or (status in ('unverified','accepted','exception') and reviewed_at is null and reviewed_by is null and review_reason is null)
);
create unique index payments_proof_unique on ethn.payments(proof_id);
grant update (state) on ethn.proof_reservations to ethn_checkout;
grant update (guest_name, guest_email, guest_phone, tracking_code, tracking_hash) on ethn.bookings to ethn_checkout;
grant insert on ethn.payments, ethn.email_outbox to ethn_checkout;
create policy submission_proof_attach on ethn.proof_reservations for update to ethn_checkout using (state = 'reserved') with check (state = 'attached');
create policy submission_booking_pending on ethn.bookings for update to ethn_checkout using (status = 'held') with check (status = 'pending');
create policy submission_booking_expired on ethn.bookings for update to ethn_checkout using (status = 'expired') with check (status = 'expired');
create policy submission_allocation_pending on ethn.court_allocations for update to ethn_checkout using (state = 'held') with check (state = 'pending');
create policy submission_payment_insert on ethn.payments for insert to ethn_checkout with check (method = 'gcash' and status in ('unverified','exception') and accepted_reference is null and collected_amount is null and received_at is null and verified_at is null and verified_by is null and reviewed_at is null and reviewed_by is null and review_reason is null);
create policy submission_outbox_insert on ethn.email_outbox for insert to ethn_checkout with check (status = 'pending' and attempts = 0 and claimed_at is null);
