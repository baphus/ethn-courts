-- DRAFT: worker access through the existing trusted checkout role.
alter table ethn.email_outbox add column claim_token uuid;
grant select on ethn.email_outbox to ethn_checkout;
grant update (status, attempts, claimed_at, available_at, claim_token) on ethn.email_outbox to ethn_checkout;
create policy outbox_worker_select on ethn.email_outbox for select to ethn_checkout using (true);
create policy outbox_worker_update on ethn.email_outbox for update to ethn_checkout using (true) with check (true);
