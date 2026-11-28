ALTER TABLE ethn.sales ADD COLUMN revision uuid, ADD COLUMN deleted_at timestamptz;
GRANT SELECT (revision, deleted_at), UPDATE (item_name, category, description, note, amount, method, received_at, revision, deleted_at) ON ethn.sales TO ethn_checkout;
