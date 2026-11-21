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
