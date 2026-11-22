-- Apply only as part of an approved ETHN migration plan; never run against legacy data.
alter table ethn.settings add column contact_facebook text, add column contact_phone text, add column contact_email text;
grant update (contact_facebook, contact_phone, contact_email, version) on ethn.settings to ethn_checkout;
-- Existing checkout_select and checkout_lock policies cover the singleton row.
