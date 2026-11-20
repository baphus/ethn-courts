-- Shared server role does not authorize humans; services must check staff_access on every operation.
grant select (user_id, role, enabled) on ethn.staff_access to ethn_checkout;
create policy checkout_staff_select on ethn.staff_access for select to ethn_checkout using (true);
-- Payment reads are needed for the staff queue and detail; no payment writes are added.
grant select (id, booking_id, method, status, claimed_reference, claimed_amount, proof_id, merchant_snapshot, collected_amount, received_at, verified_at, reviewed_at, review_reason) on ethn.payments to ethn_checkout;
