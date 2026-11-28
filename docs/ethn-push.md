# ETHN browser push retirement

Owner booking alerts are in-app only. The old subscription and push cron API routes return `410 RETIRED`. Customer booking email is unaffected.

If an operator previously installed the `ethn-push` Supabase Cron job, unschedule it during the approved rollout and remove unused push secrets from hosting and Vault. This change does not modify hosted settings or remove historical subscription tables.
