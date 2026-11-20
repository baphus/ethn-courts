-- DRAFT: fresh ETHN database only; apply after 0001_core.sql, not to legacy.
-- Prerequisite: ethn_checkout exists as a dedicated login, is not an owner,
-- superuser, or BYPASSRLS, has no elevated role memberships, and cannot create
-- roles or databases. Verify effective privileges and RLS with that login.
-- Shared server identity policies do not authorize individual customers.
revoke all on schema ethn from ethn_checkout;
revoke all on all tables in schema ethn from ethn_checkout;
revoke all on all sequences in schema ethn from ethn_checkout;

grant usage on schema ethn to ethn_checkout;
grant select on ethn.settings, ethn.courts, ethn.court_hours, ethn.bookings, ethn.booking_items, ethn.court_allocations, ethn.idempotency to ethn_checkout;
grant update (version) on ethn.settings to ethn_checkout;
grant update (active) on ethn.courts to ethn_checkout;
grant insert on ethn.bookings, ethn.booking_items, ethn.court_allocations, ethn.idempotency, ethn.audit to ethn_checkout;
grant update (status) on ethn.bookings to ethn_checkout;
grant update (state) on ethn.court_allocations to ethn_checkout;
grant update (result) on ethn.idempotency to ethn_checkout;
grant usage on sequence ethn.audit_id_seq to ethn_checkout;

create policy checkout_select on ethn.settings for select to ethn_checkout using (true);
create policy checkout_lock on ethn.settings for update to ethn_checkout using (true) with check (true);
create policy checkout_select on ethn.courts for select to ethn_checkout using (true);
create policy checkout_lock on ethn.courts for update to ethn_checkout using (true) with check (true);
create policy checkout_select on ethn.court_hours for select to ethn_checkout using (true);
create policy checkout_select on ethn.bookings for select to ethn_checkout using (true);
create policy checkout_insert on ethn.bookings for insert to ethn_checkout with check (true);
create policy checkout_expire on ethn.bookings for update to ethn_checkout using (status = 'held') with check (status = 'expired');
create policy checkout_select on ethn.booking_items for select to ethn_checkout using (true);
create policy checkout_insert on ethn.booking_items for insert to ethn_checkout with check (true);
create policy checkout_select on ethn.court_allocations for select to ethn_checkout using (true);
create policy checkout_insert on ethn.court_allocations for insert to ethn_checkout with check (true);
create policy checkout_expire on ethn.court_allocations for update to ethn_checkout using (state = 'held') with check (state = 'expired');
create policy checkout_select on ethn.idempotency for select to ethn_checkout using (true);
create policy checkout_insert on ethn.idempotency for insert to ethn_checkout with check (true);
create policy checkout_result on ethn.idempotency for update to ethn_checkout using (true) with check (true);
create policy checkout_insert on ethn.audit for insert to ethn_checkout with check (true);
