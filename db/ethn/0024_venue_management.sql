-- Fresh ETHN chain only; existing databases require a separately approved migration plan.
alter table ethn.courts add column description text check (description is null or length(description) <= 1000);
grant select (id,name,description,active) on ethn.courts to ethn_checkout;
grant insert (name,description,active) on ethn.courts to ethn_checkout;
grant usage on sequence ethn.courts_id_seq to ethn_checkout;
create policy venue_courts_insert on ethn.courts for insert to ethn_checkout with check (true);
grant select (owner_hash,operation,key,fingerprint,result) on ethn.idempotency to ethn_checkout;
grant insert (owner_hash,operation,key,fingerprint,result) on ethn.idempotency to ethn_checkout;
grant update (result) on ethn.idempotency to ethn_checkout;
create policy venue_idempotency_select on ethn.idempotency for select to ethn_checkout using (true);
create policy venue_idempotency_insert on ethn.idempotency for insert to ethn_checkout with check (true);
create policy venue_idempotency_update on ethn.idempotency for update to ethn_checkout using (true) with check (true);
