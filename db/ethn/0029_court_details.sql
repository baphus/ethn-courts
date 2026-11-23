-- Apply only through an approved ETHN migration plan, never against legacy data.
-- Small, re-encoded public court photos stay atomic with their court details.
alter table ethn.courts
  add column details_version bigint not null default 0 check (details_version >= 0),
  add column photo bytea check (octet_length(photo) <= 1048576);
grant select (details_version, photo) on ethn.courts to ethn_checkout;
grant update (description, details_version, photo) on ethn.courts to ethn_checkout;
-- Catch name edits through existing settings writes too.
create function ethn.bump_court_details_version() returns trigger language plpgsql as $$
begin
  if new.name is distinct from old.name or new.description is distinct from old.description or new.photo is distinct from old.photo then
    new.details_version := old.details_version + 1;
  end if;
  return new;
end $$;
create trigger court_details_version before update on ethn.courts for each row execute function ethn.bump_court_details_version();
-- Existing courts checkout SELECT/UPDATE policies still apply; server checks owner identity.
