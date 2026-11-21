-- Fresh ETHN chain and separately reviewed existing ETHN upgrade only.
-- Completion is operational; no-show is a correctable outcome, never a payment state.
alter table ethn.bookings add column no_show boolean not null default false;
grant update (status) on ethn.bookings to ethn_checkout;
grant select (no_show) on ethn.bookings to ethn_checkout;
grant update (no_show) on ethn.bookings to ethn_checkout;
grant update (state) on ethn.court_allocations to ethn_checkout;
create policy checkout_complete_confirmed on ethn.bookings for update to ethn_checkout using (status='confirmed') with check (status='completed');
create policy checkout_no_show_completed on ethn.bookings for update to ethn_checkout using (status='completed') with check (status='completed');
create policy checkout_complete_allocation on ethn.court_allocations for update to ethn_checkout using (state='confirmed') with check (state='completed');
grant select (id,booking_id,actor,action,detail,created_at) on ethn.audit to ethn_checkout;
grant insert (booking_id,actor,action,detail) on ethn.audit to ethn_checkout;
