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
