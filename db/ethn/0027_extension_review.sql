-- Timely extension evidence retains only the added allocation pending staff review.
-- Fresh ETHN chain and separately reviewed existing ETHN upgrade only.
ALTER TABLE ethn.extensions DROP CONSTRAINT extensions_status_check;
ALTER TABLE ethn.extensions ADD CONSTRAINT extensions_status_check
  CHECK (status IN ('held','expired','pending','confirmed','rejected'));
ALTER TABLE ethn.court_allocations DROP CONSTRAINT court_allocations_owner_state;
ALTER TABLE ethn.court_allocations ADD CONSTRAINT court_allocations_owner_state CHECK (
  (item_id IS NOT NULL AND block_id IS NULL AND extension_item_id IS NULL AND state <> 'released')
  OR (item_id IS NULL AND block_id IS NOT NULL AND extension_item_id IS NULL AND state IN ('confirmed','released'))
  OR (item_id IS NULL AND block_id IS NULL AND extension_item_id IS NOT NULL AND state IN ('held','pending','confirmed','completed','rejected','expired'))
);
CREATE TABLE ethn.extension_proofs (
  id uuid PRIMARY KEY,
  extension_id uuid NOT NULL REFERENCES ethn.extensions(id),
  object_path text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
  state text NOT NULL CHECK (state IN ('reserved','attached')),
  created_by uuid NOT NULL REFERENCES ethn.staff_access(user_id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, extension_id)
);
ALTER TABLE ethn.payments ADD COLUMN extension_proof_id uuid;
ALTER TABLE ethn.payments ADD CONSTRAINT payments_extension_proof_fk
  FOREIGN KEY (extension_proof_id, extension_id) REFERENCES ethn.extension_proofs(id, extension_id);
ALTER TABLE ethn.payments DROP CONSTRAINT payments_extension_shape;
ALTER TABLE ethn.payments ADD CONSTRAINT payments_extension_shape CHECK (
  (extension_id IS NULL AND extension_proof_id IS NULL) OR
  (extension_id IS NOT NULL AND proof_id IS NULL AND (
    status = 'accepted' OR (extension_proof_id IS NOT NULL AND status IN ('unverified','rejected','exception'))
  ))
);
ALTER TABLE ethn.extension_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ethn.extension_proofs FROM public, anon, authenticated;
GRANT SELECT (id,extension_id,object_path,mime_type,byte_size,state,created_by,created_at),
  INSERT (id,extension_id,object_path,mime_type,byte_size,state,created_by),
  UPDATE (state) ON ethn.extension_proofs TO ethn_checkout;
GRANT SELECT (extension_proof_id) ON ethn.payments TO ethn_checkout;
GRANT INSERT (extension_proof_id) ON ethn.payments TO ethn_checkout;
GRANT UPDATE (status,accepted_reference,collected_amount,received_at,verified_at,verified_by,reviewed_at,reviewed_by,review_reason) ON ethn.payments TO ethn_checkout;
GRANT UPDATE (status) ON ethn.extensions TO ethn_checkout;
GRANT UPDATE (state,expires_at) ON ethn.court_allocations TO ethn_checkout;
CREATE POLICY extension_proofs_staff_select ON ethn.extension_proofs FOR SELECT TO ethn_checkout USING (true);
CREATE POLICY extension_proofs_staff_insert ON ethn.extension_proofs FOR INSERT TO ethn_checkout WITH CHECK (state='reserved');
CREATE POLICY extension_proofs_staff_update ON ethn.extension_proofs FOR UPDATE TO ethn_checkout USING (state='reserved') WITH CHECK (state='attached');
CREATE POLICY extension_review_update ON ethn.extensions FOR UPDATE TO ethn_checkout
  USING (status IN ('held','pending','expired')) WITH CHECK (status IN ('expired','pending','confirmed','rejected'));
CREATE POLICY extension_review_allocation_update ON ethn.court_allocations FOR UPDATE TO ethn_checkout
  USING (extension_item_id IS NOT NULL AND item_id IS NULL AND block_id IS NULL AND state IN ('held','pending'))
  WITH CHECK (extension_item_id IS NOT NULL AND item_id IS NULL AND block_id IS NULL AND state IN ('pending','confirmed','rejected','expired'));
CREATE POLICY extension_review_payment_insert ON ethn.payments FOR INSERT TO ethn_checkout WITH CHECK (
  extension_id IS NOT NULL AND extension_proof_id IS NOT NULL AND proof_id IS NULL AND status='unverified'
  AND accepted_reference IS NULL AND collected_amount IS NULL AND received_at IS NULL
  AND verified_at IS NULL AND verified_by IS NULL AND reviewed_at IS NULL AND reviewed_by IS NULL AND review_reason IS NULL
);
CREATE POLICY extension_review_payment_update ON ethn.payments FOR UPDATE TO ethn_checkout
  USING (extension_id IS NOT NULL AND status='unverified') WITH CHECK (extension_id IS NOT NULL AND status IN ('accepted','rejected','exception'));
