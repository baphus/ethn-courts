-- DRAFT: apply after 0001–0004. The trusted service enforces tracking credentials.
grant select (booking_id, method, status, claimed_amount) on ethn.payments to ethn_checkout;
create policy tracking_payment_select on ethn.payments for select to ethn_checkout using (true);
