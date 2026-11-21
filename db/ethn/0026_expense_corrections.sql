-- Append-only owner corrections; apply after expense schema.
create table ethn.expense_corrections (
  id uuid primary key,
  expense_id uuid not null references ethn.expenses(id),
  previous_correction_id uuid,
  amount_delta numeric(12,2) not null check (amount_delta <> 0),
  correction_date date not null,
  reason text not null check (length(reason) between 1 and 500),
  created_by uuid not null references ethn.staff_access(user_id),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (expense_id, previous_correction_id) references ethn.expense_corrections(expense_id, id),
  unique (expense_id, id),
  unique nulls not distinct (expense_id, previous_correction_id)
);
create index expense_corrections_expense_created on ethn.expense_corrections(expense_id, created_at, id);
alter table ethn.expense_corrections enable row level security;
revoke all on ethn.expense_corrections from public, anon, authenticated;
grant select (id,expense_id,previous_correction_id,amount_delta,correction_date,reason,created_by,created_at) on ethn.expense_corrections to ethn_checkout;
grant insert (id,expense_id,previous_correction_id,amount_delta,correction_date,reason,created_by) on ethn.expense_corrections to ethn_checkout;
grant update (id) on ethn.expenses to ethn_checkout;
create policy expenses_lock_update on ethn.expenses for update to ethn_checkout using (true) with check (true);
grant select (id) on ethn.expenses to ethn_checkout;
create policy expense_corrections_select on ethn.expense_corrections for select to ethn_checkout using (true);
create policy expense_corrections_insert on ethn.expense_corrections for insert to ethn_checkout with check (true);
