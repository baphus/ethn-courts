-- Fails safely if historical references collide. Reconcile those records before cutover.
CREATE UNIQUE INDEX payments_unique_method_transfer
ON ethn.payments (method, lower(btrim(accepted_reference)))
WHERE accepted_reference IS NOT NULL;
