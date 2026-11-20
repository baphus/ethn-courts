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
