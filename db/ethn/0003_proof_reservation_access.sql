-- DRAFT: fresh ETHN database only; apply after 0001 and 0002.
-- Shared server role does not authorize customers; trusted service checks ownership.
grant select, insert on ethn.proof_reservations to ethn_checkout;
grant update (price_acknowledged) on ethn.bookings to ethn_checkout;
create policy checkout_proof_select on ethn.proof_reservations for select to ethn_checkout using (true);
create policy checkout_proof_insert on ethn.proof_reservations for insert to ethn_checkout with check (state = 'reserved');
create policy checkout_acknowledge on ethn.bookings for update to ethn_checkout using (status = 'held') with check (status = 'held');
