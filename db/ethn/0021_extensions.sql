-- Fresh ETHN chain and separately reviewed existing ETHN upgrade only.
-- Extensions own their own items/payments; original bookings and collections stay immutable.
create table ethn.extensions (
  id uuid primary key,
  booking_id uuid not null references ethn.bookings(id),
  status text not null check (status in ('held','expired','pending','confirmed','completed','rejected')),
  expires_at timestamptz not null,
  operating_date date not null,
  total numeric(12,2) not null check (total > 0),
  merchant_snapshot text,
  settings_version bigint not null,
  created_by uuid not null references ethn.staff_access(user_id),
  created_at timestamptz not null default clock_timestamp(),
  idempotency_key text not null,
  unique (booking_id,idempotency_key),
  unique (id,booking_id)
);
create unique index extensions_one_live_per_booking on ethn.extensions(booking_id) where status in ('held','pending');
create table ethn.extension_items (
  id uuid primary key,
  extension_id uuid not null references ethn.extensions(id),
  court_id bigint not null references ethn.courts(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  hourly_rate numeric(12,2) not null check (hourly_rate >= 0),
  duration_minutes integer not null check (duration_minutes > 0),
  amount numeric(12,2) not null check (amount > 0),
  interval_minutes integer not null check (interval_minutes in (30,60)),
  check (ends_at > starts_at and ends_at-starts_at=duration_minutes*interval '1 minute'),
  unique (extension_id,court_id),
  unique (id,court_id,starts_at,ends_at)
);
alter table ethn.court_allocations add column extension_item_id uuid;
alter table ethn.court_allocations drop constraint court_allocations_xor_owner;
alter table ethn.court_allocations add constraint court_allocations_xor_owner check (
  (item_id is not null and block_id is null and extension_item_id is null)
  or (item_id is null and block_id is not null and extension_item_id is null)
  or (item_id is null and block_id is null and extension_item_id is not null)
);
alter table ethn.court_allocations drop constraint court_allocations_owner_state;
alter table ethn.court_allocations add constraint court_allocations_owner_state check (
  (item_id is not null and block_id is null and extension_item_id is null and state <> 'released')
  or (item_id is null and block_id is not null and extension_item_id is null and state in ('confirmed','released'))
  or (item_id is null and block_id is null and extension_item_id is not null and state in ('held','confirmed','completed','expired'))
);
alter table ethn.court_allocations add constraint court_allocations_extension_fk
  foreign key (extension_item_id,court_id,starts_at,ends_at)
  references ethn.extension_items(id,court_id,starts_at,ends_at);
create unique index court_allocations_extension_item_id_key on ethn.court_allocations(extension_item_id) where extension_item_id is not null;

alter table ethn.payments add column extension_id uuid references ethn.extensions(id);
alter table ethn.payments add constraint payments_extension_shape check ((extension_id is null and booking_id is not null) or (extension_id is not null and booking_id is not null and status='accepted' and verified_at is not null and verified_by is not null and collected_amount is not null and received_at is not null));
drop index ethn.payments_accepted_booking;
create unique index payments_accepted_booking on ethn.payments(booking_id) where verified_at is not null and extension_id is null;
create unique index payments_accepted_extension on ethn.payments(extension_id) where verified_at is not null and extension_id is not null;
grant select (extension_id) on ethn.payments to ethn_checkout;
grant insert (extension_id) on ethn.payments to ethn_checkout;
alter table ethn.extensions enable row level security;
alter table ethn.extension_items enable row level security;
revoke all on ethn.extensions, ethn.extension_items from public, anon, authenticated;
grant select,insert (id,booking_id,status,expires_at,operating_date,total,merchant_snapshot,settings_version,created_by,idempotency_key) on ethn.extensions to ethn_checkout;
grant update (status) on ethn.extensions to ethn_checkout;
grant update (status) on ethn.bookings to ethn_checkout;
grant select,insert on ethn.extension_items to ethn_checkout;
grant select (extension_item_id) on ethn.court_allocations to ethn_checkout;
grant select (id,extension_id,court_id,starts_at,ends_at,hourly_rate,duration_minutes,amount,interval_minutes) on ethn.extension_items to ethn_checkout;
grant select (id,booking_id,status,expires_at,operating_date,total,merchant_snapshot,settings_version,created_by,created_at,idempotency_key) on ethn.extensions to ethn_checkout;
grant insert (id,item_id,block_id,extension_item_id,court_id,starts_at,ends_at,state,expires_at) on ethn.court_allocations to ethn_checkout;
grant update (state,expires_at) on ethn.court_allocations to ethn_checkout;
grant insert (id,booking_id,extension_id,method,merchant_snapshot,status,accepted_reference,collected_amount,received_at,verified_at,verified_by) on ethn.payments to ethn_checkout;
grant select (id,booking_id,actor,action,detail,created_at) on ethn.audit to ethn_checkout;
grant usage on sequence ethn.audit_id_seq to ethn_checkout;
grant insert (booking_id,actor,action,detail) on ethn.audit to ethn_checkout;
create policy extension_parent_booking_lock on ethn.bookings for update to ethn_checkout using (status='confirmed') with check (status='confirmed');
create policy extensions_staff_select on ethn.extensions for select to ethn_checkout using (true);
create policy extensions_staff_insert on ethn.extensions for insert to ethn_checkout with check (status='held');
create policy extensions_staff_update on ethn.extensions for update to ethn_checkout using (status='held' or (status='confirmed' and expires_at<=clock_timestamp())) with check (status in ('expired','confirmed','completed'));
create policy extension_items_staff_select on ethn.extension_items for select to ethn_checkout using (true);
create policy extension_items_staff_insert on ethn.extension_items for insert to ethn_checkout with check (true);
create policy checkout_extension_allocation_insert on ethn.court_allocations for insert to ethn_checkout with check (extension_item_id is not null and item_id is null and block_id is null and state='held');
create policy checkout_extension_allocation_update on ethn.court_allocations for update to ethn_checkout using (extension_item_id is not null and item_id is null and block_id is null and (state='held' or state='confirmed')) with check (extension_item_id is not null and item_id is null and block_id is null and state in ('expired','confirmed','completed'));
grant update (state) on ethn.court_allocations to ethn_checkout;
create policy checkout_complete_extension_allocation on ethn.court_allocations for update to ethn_checkout using (extension_item_id is not null and state='confirmed') with check (extension_item_id is not null and state='completed');
