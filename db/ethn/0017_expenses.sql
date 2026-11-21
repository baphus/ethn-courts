-- Fresh ETHN chain and separately reviewed existing ETHN upgrade only.
create table ethn.expenses (
  id uuid primary key,
  title text not null check (length(title) between 1 and 100),
  category text not null check (category in ('Other','Utilities','Maintenance','Supplies','Staff')),
  amount numeric(12,2) not null check (amount > 0),
  paid_date date not null check (paid_date <= (now() at time zone 'Asia/Manila')::date),
  created_by uuid not null references ethn.staff_access(user_id),
  created_at timestamptz not null default clock_timestamp()
);
create index expenses_paid_date_id on ethn.expenses(paid_date desc,created_at desc,id desc);
create index audit_actor_action_created on ethn.audit(actor,action,created_at desc);
alter table ethn.expenses enable row level security;
revoke all on ethn.expenses from public, anon, authenticated;
grant select (id,title,category,amount,paid_date,created_by,created_at) on ethn.expenses to ethn_checkout;
grant insert (id,title,category,amount,paid_date,created_by) on ethn.expenses to ethn_checkout;
create policy expenses_insert on ethn.expenses for insert to ethn_checkout with check (true);
grant select (method,status,collected_amount,received_at) on ethn.payments to ethn_checkout;
grant select (id,actor,action,detail,created_at) on ethn.audit to ethn_checkout;
create policy expenses_select on ethn.expenses for select to ethn_checkout using (true);
grant usage on sequence ethn.audit_id_seq to ethn_checkout;
