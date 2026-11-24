-- Reviewed additive upgrade. Apply only through an approved migration process.
CREATE TABLE ethn.payment_methods (
 id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_-]{0,63}$'),
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
 instructions text NOT NULL DEFAULT '' CHECK (length(instructions)<=4000),
 enabled boolean NOT NULL DEFAULT true,
 qr bytea CHECK (octet_length(qr)<=1048576), version bigint NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO ethn.payment_methods(id,name,instructions,enabled)
 SELECT 'gcash','GCash',coalesce(merchant,''),length(trim(coalesce(merchant,'')))>0 FROM ethn.settings;
INSERT INTO ethn.payment_methods(id,name,enabled) VALUES ('metrobank','Metrobank',false);
CREATE TABLE ethn.payment_method_qr_versions (
 method_id text NOT NULL REFERENCES ethn.payment_methods(id), version bigint NOT NULL, qr bytea NOT NULL CHECK(octet_length(qr)<=1048576), PRIMARY KEY(method_id,version)
);
ALTER TABLE ethn.payment_method_qr_versions ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON ethn.payment_method_qr_versions TO ethn_checkout;
CREATE POLICY payment_qr_read ON ethn.payment_method_qr_versions FOR SELECT TO ethn_checkout USING(true);
CREATE POLICY payment_qr_insert ON ethn.payment_method_qr_versions FOR INSERT TO ethn_checkout WITH CHECK(true);
ALTER TABLE ethn.payment_methods ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON ethn.payment_methods TO ethn_checkout;
CREATE POLICY payment_methods_server ON ethn.payment_methods TO ethn_checkout USING (true) WITH CHECK (true);

-- Replace only the original method/evidence shape checks, retaining money/review checks.
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='ethn.payments'::regclass AND contype='c' LOOP
  IF c.conname <> 'payments_extension_shape' AND (c.definition LIKE '%method%' OR (c.definition LIKE '%verified_at%' AND c.definition LIKE '%received_at%')) THEN
   EXECUTE format('ALTER TABLE ethn.payments DROP CONSTRAINT %I',c.conname);
  END IF;
 END LOOP;
END $$;
ALTER TABLE ethn.payments ADD CONSTRAINT payment_method_shape CHECK (method ~ '^[a-z][a-z0-9_-]{0,63}$');
ALTER TABLE ethn.payments ADD CONSTRAINT accepted_payment_evidence CHECK (
 (status='accepted' AND verified_at IS NOT NULL AND verified_by IS NOT NULL AND collected_amount IS NOT NULL)
 OR (status<>'accepted' AND verified_at IS NULL AND verified_by IS NULL AND collected_amount IS NULL AND received_at IS NULL AND accepted_reference IS NULL));
ALTER TABLE ethn.payments ADD CONSTRAINT cash_payment_shape CHECK (method<>'cash' OR (status='accepted' AND claimed_reference IS NULL AND accepted_reference IS NULL));
ALTER TABLE ethn.payments ADD CONSTRAINT payment_reference_shape CHECK (accepted_reference IS NULL OR (method<>'cash' AND length(trim(accepted_reference))>0 AND merchant_snapshot IS NOT NULL));
DROP POLICY walk_in_payment_insert ON ethn.payments;
CREATE POLICY walk_in_payment_insert ON ethn.payments FOR INSERT TO ethn_checkout WITH CHECK (
 status='accepted' AND verified_at IS NOT NULL AND verified_by IS NOT NULL AND collected_amount IS NOT NULL);
DROP POLICY submission_payment_insert ON ethn.payments;
CREATE POLICY submission_payment_insert ON ethn.payments FOR INSERT TO ethn_checkout WITH CHECK (
 method<>'cash' AND status IN ('unverified','exception') AND accepted_reference IS NULL AND collected_amount IS NULL AND received_at IS NULL AND verified_at IS NULL AND verified_by IS NULL AND reviewed_at IS NULL AND reviewed_by IS NULL AND review_reason IS NULL);

ALTER TABLE ethn.bookings ADD COLUMN payment_methods_snapshot jsonb, ADD COLUMN archived_at timestamptz, ADD COLUMN archived_by uuid REFERENCES ethn.staff_access(user_id);
GRANT SELECT(payment_methods_snapshot),INSERT(payment_methods_snapshot) ON ethn.bookings TO ethn_checkout;
ALTER TABLE ethn.bookings DROP CONSTRAINT bookings_status_check;
ALTER TABLE ethn.bookings ADD CONSTRAINT bookings_status_check CHECK(status IN ('held','expired','pending','confirmed','rejected','completed','cancelled','refunded'));
ALTER TABLE ethn.court_allocations DROP CONSTRAINT court_allocations_state_check;
ALTER TABLE ethn.court_allocations ADD CONSTRAINT court_allocations_state_check CHECK(state IN ('held','pending','confirmed','completed','expired','rejected','cancelled','refunded','blocked','released'));
GRANT SELECT(archived_at,archived_by),UPDATE(archived_at,archived_by) ON ethn.bookings TO ethn_checkout;
CREATE POLICY booking_archive ON ethn.bookings FOR UPDATE TO ethn_checkout USING(status IN ('expired','rejected','completed','cancelled','refunded')) WITH CHECK(status IN ('expired','rejected','completed','cancelled','refunded'));
CREATE POLICY booking_cancel_refund ON ethn.bookings FOR UPDATE TO ethn_checkout USING(status='confirmed') WITH CHECK(status IN ('cancelled','refunded'));
CREATE POLICY allocation_cancel_refund ON ethn.court_allocations FOR UPDATE TO ethn_checkout USING(state='confirmed') WITH CHECK(state IN ('cancelled','refunded'));
CREATE POLICY accepted_payment_lock ON ethn.payments FOR UPDATE TO ethn_checkout USING(status='accepted') WITH CHECK(status='accepted');
CREATE TABLE ethn.booking_refunds (
 booking_id uuid PRIMARY KEY REFERENCES ethn.bookings(id), payment_id uuid NOT NULL REFERENCES ethn.payments(id),
 amount numeric(12,2) NOT NULL CHECK(amount>0), method text NOT NULL,
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 500),
 reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 1 AND 200),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), recorded_by uuid NOT NULL REFERENCES ethn.staff_access(user_id)
);
ALTER TABLE ethn.booking_refunds ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON ethn.booking_refunds TO ethn_checkout;
CREATE POLICY refund_read ON ethn.booking_refunds FOR SELECT TO ethn_checkout USING(true);
CREATE POLICY refund_insert ON ethn.booking_refunds FOR INSERT TO ethn_checkout WITH CHECK(true);
