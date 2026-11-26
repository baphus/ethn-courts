ALTER TABLE ethn.booking_open_plays DROP CONSTRAINT booking_open_plays_event_url_check,
  ADD CHECK (event_url = '' OR event_url ~ '^https://reclub[.]co/m/[A-Za-z0-9_-]+$');
ALTER TABLE ethn.open_plays ADD COLUMN event_url text NOT NULL DEFAULT ''
  CHECK (event_url = '' OR event_url ~ '^https://reclub[.]co/m/[A-Za-z0-9_-]+$');
GRANT SELECT (event_url), INSERT (event_url), UPDATE (event_url) ON ethn.open_plays TO ethn_checkout;
