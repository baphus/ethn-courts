ALTER TABLE ethn.open_plays ADD COLUMN host text CHECK (host IS NULL OR char_length(btrim(host)) BETWEEN 1 AND 100);
--> statement-breakpoint
GRANT SELECT (host), INSERT (host), UPDATE (host) ON ethn.open_plays TO ethn_checkout;
