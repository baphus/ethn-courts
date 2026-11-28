ALTER TABLE ethn.notifications ADD COLUMN dismissed_at timestamptz;
--> statement-breakpoint
GRANT SELECT (dismissed_at), UPDATE (dismissed_at) ON ethn.notifications TO ethn_checkout;
