-- Fresh ETHN schema through 0028. Immutable after first application.
-- Source: 0001_core.sql
-- DRAFT: fresh empty ETHN database only. Not part of legacy migration chain.
create extension if not exists btree_gist;
create schema ethn;

create table ethn.settings (
  singleton boolean primary key default true check (singleton),
  version bigint not null default 1 check (version > 0),
  interval_minutes integer not null default 30 check (interval_minutes in (30,60)),
  minimum_minutes integer not null default 30 check (minimum_minutes > 0 and minimum_minutes % interval_minutes = 0),
  anchor_minutes integer not null default 420 check (anchor_minutes between 0 and 1439),
  horizon_days integer not null default 30 check (horizon_days > 0),
  hold_minutes integer not null default 10 check (hold_minutes > 0),
  merchant text
);
create table ethn.courts (id bigint generated always as identity primary key, name text not null unique, active boolean not null default true);
create table ethn.court_hours (
  id bigint generated always as identity primary key, court_id bigint not null references ethn.courts(id),
  weekday integer not null check (weekday between 0 and 6), opens time not null, closes time not null,
  hourly_rate numeric(12,2) check (hourly_rate >= 0), unique (court_id, weekday, opens)
);
create table ethn.staff_access (user_id uuid primary key, role text not null check (role in ('owner','staff')), enabled boolean not null default true);
create table ethn.bookings (
  id uuid primary key, owner_hash text not null, operating_date date not null,
  status text not null check (status in ('held','expired','pending','confirmed','rejected','completed')),
  expires_at timestamptz not null, total numeric(12,2) not null check (total >= 0),
  guest_name text, guest_email text, guest_phone text, tracking_code text unique, tracking_hash text unique,
  price_acknowledged boolean not null default false, merchant_snapshot text, settings_version bigint not null,
  created_at timestamptz not null default now()
);
create table ethn.booking_items (
  id uuid primary key, booking_id uuid not null references ethn.bookings(id), court_id bigint not null references ethn.courts(id),
  starts_at timestamptz not null, ends_at timestamptz not null, hourly_rate numeric(12,2) not null check (hourly_rate >= 0),
  duration_minutes integer not null check (duration_minutes > 0), amount numeric(12,2) not null check (amount >= 0),
  interval_minutes integer not null check (interval_minutes in (30,60)), minimum_minutes integer not null check (minimum_minutes > 0),
  check (ends_at > starts_at), check (ends_at - starts_at = duration_minutes * interval '1 minute'),
  unique (booking_id, court_id), unique (id, court_id, starts_at, ends_at)
);
create table ethn.court_allocations (
  id uuid primary key, item_id uuid not null unique, court_id bigint not null,
  starts_at timestamptz not null, ends_at timestamptz not null,
  state text not null check (state in ('held','pending','confirmed','completed','expired','rejected')),
  expires_at timestamptz,
  check (ends_at > starts_at), check (state <> 'held' or expires_at is not null),
  foreign key (item_id,court_id,starts_at,ends_at) references ethn.booking_items(id,court_id,starts_at,ends_at),
  exclude using gist (court_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where (state in ('held','pending','confirmed','completed'))
);
create table ethn.proof_reservations (
  id uuid primary key, booking_id uuid not null references ethn.bookings(id), owner_hash text not null,
  object_path text not null unique, mime_type text not null, byte_size bigint not null check (byte_size > 0),
  state text not null check (state in ('reserved','attached','cleanup_claimed','deleted')),
  created_at timestamptz not null default now(), unique (id, booking_id)
);
create table ethn.payments (
  id uuid primary key, booking_id uuid not null references ethn.bookings(id),
  method text not null check (method in ('gcash','cash')), merchant_snapshot text,
  status text not null check (status in ('unverified','accepted','rejected','exception')),
  claimed_reference text, claimed_amount numeric(12,2) check (claimed_amount >= 0),
  proof_id uuid, accepted_reference text collate "C", collected_amount numeric(12,2) check (collected_amount > 0),
  received_at timestamptz, verified_at timestamptz, verified_by uuid references ethn.staff_access(user_id),
  reviewed_at timestamptz, reviewed_by uuid references ethn.staff_access(user_id), review_reason text,
  foreign key (proof_id,booking_id) references ethn.proof_reservations(id,booking_id),
  check (method <> 'cash' or (status = 'accepted' and claimed_reference is null and accepted_reference is null)),
  check (accepted_reference is null or (method = 'gcash' and merchant_snapshot is not null and accepted_reference <> '')),
  check ((status <> 'accepted' and verified_at is null and verified_by is null and collected_amount is null and received_at is null and accepted_reference is null) or (status = 'accepted' and verified_at is not null and verified_by is not null and collected_amount is not null and received_at is not null and (method = 'cash' or accepted_reference is not null))),
  check ((status in ('rejected','exception') and reviewed_at is not null and reviewed_by is not null and review_reason is not null and review_reason <> '') or (status not in ('rejected','exception') and reviewed_at is null and reviewed_by is null and review_reason is null))
);
create unique index payments_accepted_booking on ethn.payments(booking_id) where verified_at is not null;
create unique index payments_accepted_reference on ethn.payments(merchant_snapshot,accepted_reference) where accepted_reference is not null;
create index payments_booking on ethn.payments(booking_id);
create index proof_booking on ethn.proof_reservations(booking_id);
create table ethn.idempotency (owner_hash text not null, operation text not null, key text not null, fingerprint text not null, result jsonb, primary key (owner_hash,operation,key));
create table ethn.audit (id bigint generated always as identity primary key, booking_id uuid references ethn.bookings(id), actor text not null, action text not null, detail jsonb, created_at timestamptz not null default now());
create table ethn.email_outbox (id uuid primary key, booking_id uuid not null references ethn.bookings(id), kind text not null, payload jsonb not null, status text not null default 'pending' check (status in ('pending','sending','sent','dead')), attempts integer not null default 0 check (attempts >= 0), claimed_at timestamptz, available_at timestamptz not null default now());
create index email_outbox_ready on ethn.email_outbox(status,available_at);

insert into ethn.settings (singleton) values (true);
insert into ethn.courts (name) values ('Court 1'), ('Court 2');
insert into ethn.court_hours (court_id,weekday,opens,closes) select c.id, d, time '07:00', time '03:00' from ethn.courts c cross join generate_series(0,6) d;

alter table ethn.settings enable row level security;
alter table ethn.courts enable row level security;
alter table ethn.court_hours enable row level security;
alter table ethn.staff_access enable row level security;
alter table ethn.bookings enable row level security;
alter table ethn.booking_items enable row level security;
alter table ethn.court_allocations enable row level security;
alter table ethn.proof_reservations enable row level security;
alter table ethn.payments enable row level security;
alter table ethn.idempotency enable row level security;
alter table ethn.audit enable row level security;
alter table ethn.email_outbox enable row level security;
revoke all on schema ethn from public, anon, authenticated;
revoke all on all tables in schema ethn from public, anon, authenticated;
revoke all on all sequences in schema ethn from public, anon, authenticated;


-- Source: 0002_checkout_access.sql
-- DRAFT: fresh ETHN database only; apply after 0001_core.sql, not to legacy.
-- Prerequisite: ethn_checkout exists as a dedicated login, is not an owner,
-- superuser, or BYPASSRLS, has no elevated role memberships, and cannot create
-- roles or databases. Verify effective privileges and RLS with that login.
-- Shared server identity policies do not authorize individual customers.
revoke all on schema ethn from ethn_checkout;
revoke all on all tables in schema ethn from ethn_checkout;
revoke all on all sequences in schema ethn from ethn_checkout;

grant usage on schema ethn to ethn_checkout;
grant select on ethn.settings, ethn.courts, ethn.court_hours, ethn.bookings, ethn.booking_items, ethn.court_allocations, ethn.idempotency to ethn_checkout;
grant update (version) on ethn.settings to ethn_checkout;
grant update (active) on ethn.courts to ethn_checkout;
grant insert on ethn.bookings, ethn.booking_items, ethn.court_allocations, ethn.idempotency, ethn.audit to ethn_checkout;
grant update (status) on ethn.bookings to ethn_checkout;
grant update (state) on ethn.court_allocations to ethn_checkout;
grant update (result) on ethn.idempotency to ethn_checkout;
grant usage on sequence ethn.audit_id_seq to ethn_checkout;

create policy checkout_select on ethn.settings for select to ethn_checkout using (true);
create policy checkout_lock on ethn.settings for update to ethn_checkout using (true) with check (true);
create policy checkout_select on ethn.courts for select to ethn_checkout using (true);
create policy checkout_lock on ethn.courts for update to ethn_checkout using (true) with check (true);
create policy checkout_select on ethn.court_hours for select to ethn_checkout using (true);
create policy checkout_select on ethn.bookings for select to ethn_checkout using (true);
create policy checkout_insert on ethn.bookings for insert to ethn_checkout with check (true);
create policy checkout_expire on ethn.bookings for update to ethn_checkout using (status = 'held') with check (status = 'expired');
create policy checkout_select on ethn.booking_items for select to ethn_checkout using (true);
create policy checkout_insert on ethn.booking_items for insert to ethn_checkout with check (true);
create policy checkout_select on ethn.court_allocations for select to ethn_checkout using (true);
create policy checkout_insert on ethn.court_allocations for insert to ethn_checkout with check (true);
create policy checkout_expire on ethn.court_allocations for update to ethn_checkout using (state = 'held') with check (state = 'expired');
create policy checkout_select on ethn.idempotency for select to ethn_checkout using (true);
create policy checkout_insert on ethn.idempotency for insert to ethn_checkout with check (true);
create policy checkout_result on ethn.idempotency for update to ethn_checkout using (true) with check (true);
create policy checkout_insert on ethn.audit for insert to ethn_checkout with check (true);


-- Source: 0003_proof_reservation_access.sql
-- DRAFT: fresh ETHN database only; apply after 0001 and 0002.
-- Shared server role does not authorize customers; trusted service checks ownership.
grant select, insert on ethn.proof_reservations to ethn_checkout;
grant update (price_acknowledged) on ethn.bookings to ethn_checkout;
create policy checkout_proof_select on ethn.proof_reservations for select to ethn_checkout using (true);
create policy checkout_proof_insert on ethn.proof_reservations for insert to ethn_checkout with check (state = 'reserved');
create policy checkout_acknowledge on ethn.bookings for update to ethn_checkout using (status = 'held') with check (status = 'held');


-- Source: 0004_submission.sql
-- DRAFT: fresh ETHN database, after 0001–0003. Shared role requires trusted ownership checks.
alter table ethn.payments drop constraint payments_check3;
alter table ethn.payments add constraint payments_review_check check (
  (status in ('rejected','exception') and reviewed_at is not null and reviewed_by is not null and review_reason is not null and review_reason <> '')
  or (status in ('unverified','accepted','exception') and reviewed_at is null and reviewed_by is null and review_reason is null)
);
create unique index payments_proof_unique on ethn.payments(proof_id);
grant update (state) on ethn.proof_reservations to ethn_checkout;
grant update (guest_name, guest_email, guest_phone, tracking_code, tracking_hash) on ethn.bookings to ethn_checkout;
grant insert on ethn.payments, ethn.email_outbox to ethn_checkout;
create policy submission_proof_attach on ethn.proof_reservations for update to ethn_checkout using (state = 'reserved') with check (state = 'attached');
create policy submission_booking_pending on ethn.bookings for update to ethn_checkout using (status = 'held') with check (status = 'pending');
create policy submission_booking_expired on ethn.bookings for update to ethn_checkout using (status = 'expired') with check (status = 'expired');
create policy submission_allocation_pending on ethn.court_allocations for update to ethn_checkout using (state = 'held') with check (state = 'pending');
create policy submission_payment_insert on ethn.payments for insert to ethn_checkout with check (method = 'gcash' and status in ('unverified','exception') and accepted_reference is null and collected_amount is null and received_at is null and verified_at is null and verified_by is null and reviewed_at is null and reviewed_by is null and review_reason is null);
create policy submission_outbox_insert on ethn.email_outbox for insert to ethn_checkout with check (status = 'pending' and attempts = 0 and claimed_at is null);


-- Source: 0005_tracking_access.sql
-- DRAFT: apply after 0001–0004. The trusted service enforces tracking credentials.
grant select (booking_id, method, status, claimed_amount) on ethn.payments to ethn_checkout;
create policy tracking_payment_select on ethn.payments for select to ethn_checkout using (true);


-- Source: 0006_outbox_access.sql
-- DRAFT: worker access through the existing trusted checkout role.
alter table ethn.email_outbox add column claim_token uuid;
grant select on ethn.email_outbox to ethn_checkout;
grant update (status, attempts, claimed_at, available_at, claim_token) on ethn.email_outbox to ethn_checkout;
create policy outbox_worker_select on ethn.email_outbox for select to ethn_checkout using (true);
create policy outbox_worker_update on ethn.email_outbox for update to ethn_checkout using (true) with check (true);


-- Source: 0007_staff_payment_read.sql
-- Shared server role does not authorize humans; services must check staff_access on every operation.
grant select (user_id, role, enabled) on ethn.staff_access to ethn_checkout;
create policy checkout_staff_select on ethn.staff_access for select to ethn_checkout using (true);
-- Payment reads are needed for the staff queue and detail; no payment writes are added.
grant select (id, booking_id, method, status, claimed_reference, claimed_amount, proof_id, merchant_snapshot, collected_amount, received_at, verified_at, reviewed_at, review_reason) on ethn.payments to ethn_checkout;


-- Source: 0008_payment_decision.sql
-- Shared server role: service must verify staff identity; grants alone do not authorize users.
-- Existing payments receive migration time, not their original submission time.
alter table ethn.payments add column created_at timestamptz not null default clock_timestamp();
grant select (created_at, accepted_reference, verified_by, reviewed_by) on ethn.payments to ethn_checkout;
grant update (status, accepted_reference, collected_amount, received_at, verified_at, verified_by, reviewed_at, reviewed_by, review_reason) on ethn.payments to ethn_checkout;
grant update (enabled) on ethn.staff_access to ethn_checkout;
create policy decision_staff_lock on ethn.staff_access for update to ethn_checkout using (enabled and role in ('owner','staff')) with check (enabled and role in ('owner','staff'));
create policy decision_payment on ethn.payments for update to ethn_checkout using (status = 'unverified') with check (status in ('accepted','rejected'));
create policy decision_booking on ethn.bookings for update to ethn_checkout using (status = 'pending') with check (status in ('confirmed','rejected'));
create policy decision_allocation on ethn.court_allocations for update to ethn_checkout using (state = 'pending') with check (state in ('confirmed','rejected'));


-- Source: 0009_owner_pricing.sql
-- Fresh ETHN schema after 0008; shared role requires server-side owner authorization.
grant update (merchant, version) on ethn.settings to ethn_checkout;
grant update (name) on ethn.courts to ethn_checkout;
grant update (hourly_rate) on ethn.court_hours to ethn_checkout;
create policy checkout_hours_update on ethn.court_hours for update to ethn_checkout using (true) with check (true);


-- Source: 0010_owner_hours.sql
grant insert, delete on ethn.court_hours to ethn_checkout;
grant usage on sequence ethn.court_hours_id_seq to ethn_checkout;
create policy court_hours_insert on ethn.court_hours for insert to ethn_checkout with check (true);
create policy court_hours_delete on ethn.court_hours for delete to ethn_checkout using (true);


-- Source: 0011_staff_access.sql
-- Owner staff management. Shared role still requires server-side human authorization.
grant insert (user_id, role, enabled), update (role, enabled) on ethn.staff_access to ethn_checkout;
create policy staff_management_insert on ethn.staff_access for insert to ethn_checkout with check (role in ('owner','staff'));
create policy staff_management_update on ethn.staff_access for update to ethn_checkout using (true) with check (role in ('owner','staff'));


-- Source: 0012_exception_review.sql
-- DRAFT: fresh ETHN database only. Requires 0001-0010; independent of 0011 and safe after it.
-- Shared server role: the service must verify current enabled staff before locking or writing.
-- reviewed_at, reviewed_by and review_reason updates are already granted by 0008; no broader payment write grant.
-- Exception review records assessment only: status stays exception and booking stays expired.
create policy exception_review_payment on ethn.payments for update to ethn_checkout
  using (status = 'exception')
  with check (
    status = 'exception'
    and reviewed_at is not null
    and reviewed_by is not null
    and review_reason is not null
    and review_reason <> ''
  );


-- Source: 0013_walk_in.sql
-- Prepaid walk-in: staff records full payment at the desk, then the booking is confirmed.
-- Shared role still requires server-side staff authorization; this policy only constrains shape.
create policy walk_in_payment_insert on ethn.payments for insert to ethn_checkout with check (
  status = 'accepted' and verified_at is not null and verified_by is not null
  and collected_amount is not null and received_at is not null
  and ((method = 'cash' and accepted_reference is null and claimed_reference is null)
    or (method = 'gcash' and accepted_reference is not null and merchant_snapshot is not null))
);


-- Source: 0014_admin_booking_read.sql
-- Staff read API: narrow additional payment metadata only; booking/item reads already granted by 0002.
grant select (reviewed_at, review_reason) on ethn.payments to ethn_checkout;


-- Source: 0015_court_blocks.sql
-- Fresh ETHN chain and separately reviewed existing ETHN upgrade only.
create table ethn.court_blocks (
  id uuid primary key,
  court_id bigint not null references ethn.courts(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  kind text not null check (kind in ('maintenance','private')),
  reason text not null check (length(reason) between 1 and 500),
  created_by uuid not null references ethn.staff_access(user_id),
  created_at timestamptz not null default clock_timestamp(),
  removed_by uuid references ethn.staff_access(user_id),
  removed_at timestamptz,
  check (ends_at > starts_at),
  check ((removed_by is null) = (removed_at is null)),
  unique (id, court_id, starts_at, ends_at)
);
alter table ethn.court_allocations alter column item_id drop not null;
alter table ethn.court_allocations add column block_id uuid;
alter table ethn.court_allocations drop constraint court_allocations_state_check;
alter table ethn.court_allocations add constraint court_allocations_state_check check (state in ('held','pending','confirmed','completed','expired','rejected','released'));
alter table ethn.court_allocations add constraint court_allocations_xor_owner check ((item_id is null) <> (block_id is null));
alter table ethn.court_allocations add constraint court_allocations_owner_state check ((item_id is not null and block_id is null and state <> 'released') or (item_id is null and block_id is not null and state in ('confirmed','released')));
alter table ethn.court_allocations add constraint court_allocations_block_fk foreign key (block_id,court_id,starts_at,ends_at) references ethn.court_blocks(id,court_id,starts_at,ends_at);
alter table ethn.court_allocations drop constraint court_allocations_item_id_key;
create unique index court_allocations_item_id_key on ethn.court_allocations(item_id) where item_id is not null;
create unique index court_allocations_block_id_key on ethn.court_allocations(block_id) where block_id is not null;
alter table ethn.court_allocations drop constraint court_allocations_court_id_tstzrange_excl;
alter table ethn.court_allocations add constraint court_allocations_court_id_tstzrange_excl exclude using gist (court_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where (state in ('held','pending','confirmed','completed'));
alter table ethn.court_blocks enable row level security;
revoke all on ethn.court_blocks from public, anon, authenticated;
grant select on ethn.court_blocks to ethn_checkout;
grant insert (id,court_id,starts_at,ends_at,kind,reason,created_by) on ethn.court_blocks to ethn_checkout;
grant update (removed_by,removed_at) on ethn.court_blocks to ethn_checkout;
grant select (block_id) on ethn.court_allocations to ethn_checkout;
grant insert (id,item_id,block_id,court_id,starts_at,ends_at,state,expires_at) on ethn.court_allocations to ethn_checkout;
grant update (state) on ethn.court_allocations to ethn_checkout;
grant usage on sequence ethn.audit_id_seq to ethn_checkout;
create policy court_blocks_select on ethn.court_blocks for select to ethn_checkout using (true);
create policy court_blocks_insert on ethn.court_blocks for insert to ethn_checkout with check (true);
create policy court_blocks_remove on ethn.court_blocks for update to ethn_checkout using (removed_at is null) with check (removed_at is not null);
drop policy checkout_insert on ethn.court_allocations;
create policy checkout_insert on ethn.court_allocations for insert to ethn_checkout with check (block_id is null and item_id is not null);
drop policy checkout_expire on ethn.court_allocations;
create policy checkout_expire on ethn.court_allocations for update to ethn_checkout using (block_id is null and item_id is not null and state='held') with check (block_id is null and item_id is not null and state='expired');
create policy court_block_allocation_release on ethn.court_allocations for update to ethn_checkout using (block_id is not null and state='confirmed') with check (block_id is not null and state='released');
create policy court_block_allocation_insert on ethn.court_allocations for insert to ethn_checkout with check (block_id is not null and item_id is null and state='confirmed');


-- Source: 0016_audit_read.sql
-- Fresh ETHN chain and separately reviewed existing ETHN upgrade only.
-- Runtime owner authorization is enforced by the application, not the shared DB login.
grant select (id,booking_id,actor,action,detail,created_at) on ethn.audit to ethn_checkout;
create policy checkout_audit_read on ethn.audit for select to ethn_checkout using (true);


-- Source: 0017_expenses.sql
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


-- Source: 0018_booking_outcomes.sql
-- Fresh ETHN chain and separately reviewed existing ETHN upgrade only.
-- Completion is operational; no-show is a correctable outcome, never a payment state.
alter table ethn.bookings add column no_show boolean not null default false;
grant update (status) on ethn.bookings to ethn_checkout;
grant select (no_show) on ethn.bookings to ethn_checkout;
grant update (no_show) on ethn.bookings to ethn_checkout;
grant update (state) on ethn.court_allocations to ethn_checkout;
create policy checkout_complete_confirmed on ethn.bookings for update to ethn_checkout using (status='confirmed') with check (status='completed');
create policy checkout_no_show_completed on ethn.bookings for update to ethn_checkout using (status='completed') with check (status='completed');
create policy checkout_complete_allocation on ethn.court_allocations for update to ethn_checkout using (state='confirmed') with check (state='completed');
grant select (id,booking_id,actor,action,detail,created_at) on ethn.audit to ethn_checkout;
grant insert (booking_id,actor,action,detail) on ethn.audit to ethn_checkout;


-- Source: 0019_open_plays.sql
-- Fresh ETHN chain and separately reviewed existing ETHN upgrade only.
create table ethn.open_plays (
  id uuid primary key,
  title text not null check (length(title) between 1 and 100),
  description text not null check (length(description) <= 2000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  informational_fee numeric(12,2) not null check (informational_fee >= 0),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references ethn.staff_access(user_id),
  created_at timestamptz not null default clock_timestamp(),
  removed_by uuid references ethn.staff_access(user_id),
  removed_at timestamptz,
  check (ends_at > starts_at),
  check ((removed_by is null) = (removed_at is null))
);
create index open_plays_upcoming on ethn.open_plays(starts_at,id) where removed_at is null;
alter table ethn.court_blocks add column open_play_id uuid references ethn.open_plays(id);
alter table ethn.court_blocks drop constraint court_blocks_kind_check;
alter table ethn.court_blocks add constraint court_blocks_kind_check check (kind in ('maintenance','private','open_play'));
alter table ethn.court_blocks add constraint court_blocks_open_play_owner check ((kind='open_play') = (open_play_id is not null));
create index court_blocks_open_play_id on ethn.court_blocks(open_play_id) where open_play_id is not null;
alter table ethn.open_plays enable row level security;
revoke all on ethn.open_plays from public, anon, authenticated;
grant select (id,title,description,starts_at,ends_at,informational_fee,version,removed_at) on ethn.open_plays to ethn_checkout;
grant insert (id,title,description,starts_at,ends_at,informational_fee,created_by) on ethn.open_plays to ethn_checkout;
grant update (title,description,starts_at,ends_at,informational_fee,version,removed_by,removed_at) on ethn.open_plays to ethn_checkout;
create policy open_plays_select on ethn.open_plays for select to ethn_checkout using (true);
create policy open_plays_insert on ethn.open_plays for insert to ethn_checkout with check (true);
create policy open_plays_update on ethn.open_plays for update to ethn_checkout using (removed_at is null) with check (removed_at is null OR removed_by IS NOT NULL);
grant select (open_play_id) on ethn.court_blocks to ethn_checkout;
grant insert (open_play_id) on ethn.court_blocks to ethn_checkout;


-- Source: 0020_sales.sql
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


-- Source: 0021_extensions.sql
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


-- Source: 0022_notifications.sql
-- Fresh ETHN chain and separately reviewed existing ETHN upgrade only.
-- Inbox events contain no customer, payment, proof or tracking data.
create table ethn.notifications (
  id uuid primary key,
  recipient uuid not null references ethn.staff_access(user_id),
  event_key text not null check (length(event_key) between 1 and 160),
  title text not null check (length(title) between 1 and 120),
  body text not null check (length(body) between 1 and 240),
  link text not null check (link = '/admin/exceptions' or link ~ '^/admin/bookings/[0-9a-f-]{36}$'),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  unique (recipient, event_key)
);
create index notifications_recipient_created on ethn.notifications(recipient, created_at desc, id desc);
alter table ethn.notifications enable row level security;
revoke all on ethn.notifications from public, anon, authenticated;
grant select (id, recipient, event_key, title, body, link, created_at, read_at) on ethn.notifications to ethn_checkout;
grant insert (id, recipient, event_key, title, body, link) on ethn.notifications to ethn_checkout;
grant update (read_at) on ethn.notifications to ethn_checkout;
create policy notifications_select on ethn.notifications for select to ethn_checkout using (true);
create policy notifications_insert on ethn.notifications for insert to ethn_checkout with check (true);
create policy notifications_update_read on ethn.notifications for update to ethn_checkout using (true) with check (true);


-- Source: 0023_walk_in_holds.sql
-- Staff-owned walk-in holds; actor binding is server written and never exposed to clients.
alter table ethn.bookings add column walk_in_actor uuid references ethn.staff_access(user_id);
grant select (walk_in_actor) on ethn.bookings to ethn_checkout;
create policy walk_in_allocation_confirm on ethn.court_allocations for update to ethn_checkout using (state='held' AND item_id IN (SELECT id FROM ethn.booking_items WHERE booking_id IN (SELECT id FROM ethn.bookings WHERE walk_in_actor IS NOT NULL))) with check (state='confirmed');
grant insert (walk_in_actor) on ethn.bookings to ethn_checkout;
grant update (status) on ethn.bookings to ethn_checkout;
create policy walk_in_confirm on ethn.bookings for update to ethn_checkout using (status = 'held' and walk_in_actor is not null) with check (status = 'confirmed' and walk_in_actor is not null);


-- Source: 0024_venue_management.sql
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


-- Source: 0025_timing_policy.sql
-- Fresh ETHN chain only; existing databases require a separately approved migration plan.
grant update (interval_minutes,minimum_minutes,anchor_minutes,horizon_days,hold_minutes,version) on ethn.settings to ethn_checkout;


-- Source: 0026_contact_settings.sql
-- Apply only as part of an approved ETHN migration plan; never run against legacy data.
alter table ethn.settings add column contact_facebook text, add column contact_phone text, add column contact_email text;
grant update (contact_facebook, contact_phone, contact_email, version) on ethn.settings to ethn_checkout;
-- Existing checkout_select and checkout_lock policies cover the singleton row.


-- Source: 0026_expense_corrections.sql
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


-- Source: 0027_extension_review.sql
-- Timely extension evidence retains only the added allocation pending staff review.
-- Fresh ETHN chain and separately reviewed existing ETHN upgrade only.
ALTER TABLE ethn.extensions DROP CONSTRAINT extensions_status_check;
ALTER TABLE ethn.extensions ADD CONSTRAINT extensions_status_check
  CHECK (status IN ('held','expired','pending','confirmed','rejected'));
ALTER TABLE ethn.court_allocations DROP CONSTRAINT court_allocations_owner_state;
ALTER TABLE ethn.court_allocations ADD CONSTRAINT court_allocations_owner_state CHECK (
  (item_id IS NOT NULL AND block_id IS NULL AND extension_item_id IS NULL AND state <> 'released')
  OR (item_id IS NULL AND block_id IS NOT NULL AND extension_item_id IS NULL AND state IN ('confirmed','released'))
  OR (item_id IS NULL AND block_id IS NULL AND extension_item_id IS NOT NULL AND state IN ('held','pending','confirmed','completed','rejected','expired'))
);
CREATE TABLE ethn.extension_proofs (
  id uuid PRIMARY KEY,
  extension_id uuid NOT NULL REFERENCES ethn.extensions(id),
  object_path text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
  state text NOT NULL CHECK (state IN ('reserved','attached')),
  created_by uuid NOT NULL REFERENCES ethn.staff_access(user_id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, extension_id)
);
ALTER TABLE ethn.payments ADD COLUMN extension_proof_id uuid;
ALTER TABLE ethn.payments ADD CONSTRAINT payments_extension_proof_fk
  FOREIGN KEY (extension_proof_id, extension_id) REFERENCES ethn.extension_proofs(id, extension_id);
ALTER TABLE ethn.payments DROP CONSTRAINT payments_extension_shape;
ALTER TABLE ethn.payments ADD CONSTRAINT payments_extension_shape CHECK (
  (extension_id IS NULL AND extension_proof_id IS NULL) OR
  (extension_id IS NOT NULL AND proof_id IS NULL AND (
    status = 'accepted' OR (extension_proof_id IS NOT NULL AND status IN ('unverified','rejected','exception'))
  ))
);
ALTER TABLE ethn.extension_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ethn.extension_proofs FROM public, anon, authenticated;
GRANT SELECT (id,extension_id,object_path,mime_type,byte_size,state,created_by,created_at),
  INSERT (id,extension_id,object_path,mime_type,byte_size,state,created_by),
  UPDATE (state) ON ethn.extension_proofs TO ethn_checkout;
GRANT SELECT (extension_proof_id) ON ethn.payments TO ethn_checkout;
GRANT INSERT (extension_proof_id) ON ethn.payments TO ethn_checkout;
GRANT UPDATE (status,accepted_reference,collected_amount,received_at,verified_at,verified_by,reviewed_at,reviewed_by,review_reason) ON ethn.payments TO ethn_checkout;
GRANT UPDATE (status) ON ethn.extensions TO ethn_checkout;
GRANT UPDATE (state,expires_at) ON ethn.court_allocations TO ethn_checkout;
CREATE POLICY extension_proofs_staff_select ON ethn.extension_proofs FOR SELECT TO ethn_checkout USING (true);
CREATE POLICY extension_proofs_staff_insert ON ethn.extension_proofs FOR INSERT TO ethn_checkout WITH CHECK (state='reserved');
CREATE POLICY extension_proofs_staff_update ON ethn.extension_proofs FOR UPDATE TO ethn_checkout USING (state='reserved') WITH CHECK (state='attached');
CREATE POLICY extension_review_update ON ethn.extensions FOR UPDATE TO ethn_checkout
  USING (status IN ('held','pending','expired')) WITH CHECK (status IN ('expired','pending','confirmed','rejected'));
CREATE POLICY extension_review_allocation_update ON ethn.court_allocations FOR UPDATE TO ethn_checkout
  USING (extension_item_id IS NOT NULL AND item_id IS NULL AND block_id IS NULL AND state IN ('held','pending'))
  WITH CHECK (extension_item_id IS NOT NULL AND item_id IS NULL AND block_id IS NULL AND state IN ('pending','confirmed','rejected','expired'));
CREATE POLICY extension_review_payment_insert ON ethn.payments FOR INSERT TO ethn_checkout WITH CHECK (
  extension_id IS NOT NULL AND extension_proof_id IS NOT NULL AND proof_id IS NULL AND status='unverified'
  AND accepted_reference IS NULL AND collected_amount IS NULL AND received_at IS NULL
  AND verified_at IS NULL AND verified_by IS NULL AND reviewed_at IS NULL AND reviewed_by IS NULL AND review_reason IS NULL
);
CREATE POLICY extension_review_payment_update ON ethn.payments FOR UPDATE TO ethn_checkout
  USING (extension_id IS NOT NULL AND status='unverified') WITH CHECK (extension_id IS NOT NULL AND status IN ('accepted','rejected','exception'));


-- Source: 0028_web_push.sql
-- Fresh ETHN chain and separately reviewed existing ETHN upgrade only.
create table ethn.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references ethn.staff_access(user_id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 1 and 2048),
  p256dh text not null check (length(p256dh) between 80 and 100),
  auth text not null check (length(auth) between 20 and 30),
  created_at timestamptz not null default clock_timestamp(),
  disabled_at timestamptz
);
create index push_subscriptions_user on ethn.push_subscriptions(user_id) where disabled_at is null;
create table ethn.push_deliveries (
  notification_id uuid not null references ethn.notifications(id) on delete cascade,
  subscription_id uuid not null references ethn.push_subscriptions(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','sent','dead')),
  attempts integer not null default 0 check(attempts between 0 and 5),
  next_attempt_at timestamptz not null default clock_timestamp(),
  claimed_at timestamptz,
  primary key(notification_id, subscription_id)
);
create index push_deliveries_due on ethn.push_deliveries(next_attempt_at) where status='pending';
alter table ethn.push_subscriptions enable row level security;
alter table ethn.push_deliveries enable row level security;
revoke all on ethn.push_subscriptions, ethn.push_deliveries from public, anon, authenticated;
grant select (id,user_id,endpoint,p256dh,auth,created_at,disabled_at) on ethn.push_subscriptions to ethn_checkout;
grant insert (user_id,endpoint,p256dh,auth) on ethn.push_subscriptions to ethn_checkout;
grant update (p256dh,auth,disabled_at) on ethn.push_subscriptions to ethn_checkout;
grant select (notification_id,subscription_id,status,attempts,next_attempt_at,claimed_at) on ethn.push_deliveries to ethn_checkout;
grant insert (notification_id,subscription_id) on ethn.push_deliveries to ethn_checkout;
grant update (status,attempts,next_attempt_at,claimed_at) on ethn.push_deliveries to ethn_checkout;
create policy push_subscriptions_access on ethn.push_subscriptions for all to ethn_checkout using(true) with check(true);
create policy push_deliveries_select on ethn.push_deliveries for select to ethn_checkout using(true);
create policy push_deliveries_insert on ethn.push_deliveries for insert to ethn_checkout with check(true);
create policy push_deliveries_update on ethn.push_deliveries for update to ethn_checkout using(true) with check(true);
