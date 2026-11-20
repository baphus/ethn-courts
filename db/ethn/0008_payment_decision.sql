-- Shared server role: service must verify staff identity; grants alone do not authorize users.
-- Existing payments receive migration time, not their original submission time.
alter table ethn.payments add column created_at timestamptz not null default clock_timestamp();
grant select (created_at, accepted_reference, verified_by, reviewed_by) on ethn.payments to ethn_checkout;
grant update (status, accepted_reference, collected_amount, received_at, verified_at, verified_by, reviewed_at, reviewed_by, review_reason) on ethn.payments to ethn_checkout;
grant update (enabled) on ethn.staff_access to ethn_checkout;
create policy decision_staff_lock on ethn.staff_access for update to ethn_checkout using (enabled and role in ('owner','staff')) with check (enabled and role in ('owner','staff'));
create policy decision_payment on ethn.payments for update to ethn_checkout using (status = 'unverified') with check (status in ('accepted','rejected'));
create policy decision_booking on ethn.bookings for update to ethn_checkout using (status = 'pending') with check (status in ('confirmed','rejected'));
create policy decision_allocation on ethn.court_allocations for update to ethn_checkout using (state = 'pending') with check (state in ('confirmed','rejected'));
