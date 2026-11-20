-- Owner staff management. Shared role still requires server-side human authorization.
grant insert (user_id, role, enabled), update (role, enabled) on ethn.staff_access to ethn_checkout;
create policy staff_management_insert on ethn.staff_access for insert to ethn_checkout with check (role in ('owner','staff'));
create policy staff_management_update on ethn.staff_access for update to ethn_checkout using (true) with check (role in ('owner','staff'));
