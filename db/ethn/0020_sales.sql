-- Paid manual sales only; corrections are immutable dated ledger deltas, not refunds.
create table ethn.sales (
  id uuid primary key,
  description text not null check (length(description) between 1 and 160),
  note text check (note is null or length(note) <= 500),
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('cash','gcash')),
  received_at timestamptz not null,
  created_by uuid not null references ethn.staff_access(user_id),
  created_at timestamptz not null default clock_timestamp()
);
create table ethn.sale_corrections (
  id uuid primary key,
  sale_id uuid not null references ethn.sales(id),
  previous_id uuid,
  expected_previous_id uuid,
  amount_delta numeric(12,2) not null,
  cash_delta numeric(12,2) not null,
  gcash_delta numeric(12,2) not null,
  reason text not null check (length(reason) between 1 and 500),
  created_by uuid not null references ethn.staff_access(user_id),
  created_at timestamptz not null default clock_timestamp(),
  unique (id, sale_id),
  unique nulls not distinct (sale_id, expected_previous_id),
  foreign key (previous_id, sale_id) references ethn.sale_corrections(id, sale_id),
  check (amount_delta <> 0 or cash_delta <> 0 or gcash_delta <> 0),
  check (cash_delta + gcash_delta = amount_delta),
  check ((previous_id is null and expected_previous_id is null) or previous_id = expected_previous_id)
);
create index sales_received_at_id on ethn.sales(received_at,id);
create index sale_corrections_created_at_id on ethn.sale_corrections(created_at,id);
alter table ethn.sales enable row level security;
alter table ethn.sale_corrections enable row level security;
revoke all on ethn.sales,ethn.sale_corrections from public,anon,authenticated;
grant select (id,description,note,amount,method,received_at,created_by,created_at) on ethn.sales to ethn_checkout;
grant update (id) on ethn.sales to ethn_checkout;
create policy sales_lock on ethn.sales for update to ethn_checkout using (true) with check (true);
grant update (enabled) on ethn.staff_access to ethn_checkout;
create policy sales_staff_lock on ethn.staff_access for update to ethn_checkout using (enabled and role in ('owner','staff')) with check (enabled and role in ('owner','staff'));
grant insert (id,description,note,amount,method,received_at,created_by) on ethn.sales to ethn_checkout;
grant select (id,sale_id,previous_id,expected_previous_id,amount_delta,cash_delta,gcash_delta,reason,created_by,created_at) on ethn.sale_corrections to ethn_checkout;
grant insert (id,sale_id,previous_id,expected_previous_id,amount_delta,cash_delta,gcash_delta,reason,created_by) on ethn.sale_corrections to ethn_checkout;
create policy sales_select on ethn.sales for select to ethn_checkout using (true);
create policy sales_insert on ethn.sales for insert to ethn_checkout with check (true);
create policy sale_corrections_select on ethn.sale_corrections for select to ethn_checkout using (true);
create policy sale_corrections_insert on ethn.sale_corrections for insert to ethn_checkout with check (true);
grant usage on sequence ethn.audit_id_seq to ethn_checkout;
grant select (id,actor,action,detail,created_at) on ethn.audit to ethn_checkout;
