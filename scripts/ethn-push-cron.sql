-- Operator setup on the approved ETHN Supabase project, not a migration.
-- Enable Supabase Cron and pg_net. Create Vault entries ethn_push_origin
-- (deployed HTTPS origin, no trailing slash) and ethn_push_cron_secret
-- (same dedicated value as ETHN_PUSH_CRON_SECRET on Vercel).
-- pg_net queues headers in plaintext. Never use CRON_SECRET or a service-role key here.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'ethn_push_origin' AND decrypted_secret ~ '^https://[^/?#[:space:]@]+$'
  ) OR NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'ethn_push_cron_secret' AND length(decrypted_secret) >= 32
  ) THEN
    RAISE EXCEPTION 'Configure ethn_push_origin and ethn_push_cron_secret in Vault first';
  END IF;

  PERFORM cron.schedule('ethn-push', '* * * * *', $job$
    SELECT net.http_get(
      url := origin.decrypted_secret || '/api/cron/ethn-push',
      headers := jsonb_build_object('Authorization', 'Bearer ' || token.decrypted_secret),
      timeout_milliseconds := 30000
    )
    FROM vault.decrypted_secrets AS origin, vault.decrypted_secrets AS token
    WHERE origin.name = 'ethn_push_origin' AND token.name = 'ethn_push_cron_secret';
  $job$);
END;
$$;

-- Disable: SELECT cron.unschedule('ethn-push');
