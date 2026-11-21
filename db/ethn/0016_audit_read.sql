-- Fresh ETHN chain and separately reviewed existing ETHN upgrade only.
-- Runtime owner authorization is enforced by the application, not the shared DB login.
grant select (id,booking_id,actor,action,detail,created_at) on ethn.audit to ethn_checkout;
create policy checkout_audit_read on ethn.audit for select to ethn_checkout using (true);
