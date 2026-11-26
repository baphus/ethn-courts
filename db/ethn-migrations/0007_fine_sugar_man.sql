CREATE TABLE ethn.booking_open_plays (
  booking_id uuid PRIMARY KEY REFERENCES ethn.bookings(id),
  id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  description text NOT NULL CHECK (char_length(description) <= 500),
  event_url text NOT NULL CHECK (event_url ~ '^https://reclub[.]co/m/[A-Za-z0-9_-]+$'),
  removed boolean NOT NULL DEFAULT false,
  hidden boolean NOT NULL DEFAULT false
);
ALTER TABLE ethn.booking_open_plays ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ethn.booking_open_plays FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT (booking_id,title,description,event_url),
  UPDATE (title,description,event_url,removed,hidden) ON ethn.booking_open_plays TO ethn_checkout;
CREATE POLICY booking_open_plays_runtime ON ethn.booking_open_plays TO ethn_checkout USING (true) WITH CHECK (true);

--> statement-breakpoint
CREATE VIEW ethn.booking_open_play_sessions WITH (security_invoker = true) AS
WITH slots AS (
  SELECT booking_id,court_id,starts_at,ends_at FROM ethn.booking_items
  UNION ALL
  SELECT e.booking_id,i.court_id,i.starts_at,i.ends_at
  FROM ethn.extension_items i JOIN ethn.extensions e ON e.id=i.extension_id AND e.status='confirmed'
), court_sessions AS (
  SELECT booking_id,court_id,min(starts_at) AS starts_at,max(ends_at) AS ends_at,
    sum(ends_at-starts_at)=max(ends_at)-min(starts_at) AS continuous
  FROM slots GROUP BY booking_id,court_id
)
SELECT booking_id,min(starts_at) AS starts_at,max(ends_at) AS ends_at,
  array_agg(c.name ORDER BY c.id) AS court_names,array_agg(c.id::text ORDER BY c.id) AS court_ids
FROM court_sessions s JOIN ethn.courts c ON c.id=s.court_id
GROUP BY booking_id
HAVING bool_and(continuous) AND min(starts_at)=max(starts_at) AND min(ends_at)=max(ends_at);
REVOKE ALL ON ethn.booking_open_play_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON ethn.booking_open_play_sessions TO ethn_checkout;
