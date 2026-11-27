ALTER TABLE ethn.court_blocks DROP CONSTRAINT court_blocks_kind_check;
ALTER TABLE ethn.court_blocks ADD CONSTRAINT court_blocks_kind_check
  CHECK (kind IN ('maintenance','private','open_play','deleted_booking'));
--> statement-breakpoint
CREATE TABLE ethn.deleted_booking_proofs (
  object_path text PRIMARY KEY CHECK (object_path ~ '^(incoming|extension-incoming)/[0-9a-f]{64}\.(jpg|png|webp)$'),
  booking_id uuid NOT NULL,
  final_after timestamptz NOT NULL,
  next_attempt timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE ethn.deleted_booking_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ethn.deleted_booking_proofs FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE, UPDATE (next_attempt) ON ethn.deleted_booking_proofs TO ethn_checkout;
CREATE POLICY deleted_booking_proofs_runtime ON ethn.deleted_booking_proofs TO ethn_checkout USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE FUNCTION ethn.permanently_delete_booking(target uuid, owner_id uuid, deletion_reason text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  cutoff timestamptz;
  extension_ids uuid[];
  proof_ids text[];
  has_proofs boolean;
BEGIN
  IF deletion_reason IS NULL OR char_length(btrim(deletion_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  PERFORM 1 FROM ethn.staff_access WHERE user_id = owner_id AND enabled AND role = 'owner' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM id FROM ethn.courts ORDER BY id FOR UPDATE;
  PERFORM id FROM ethn.bookings WHERE id = target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  PERFORM id FROM ethn.extensions WHERE booking_id = target ORDER BY id FOR UPDATE;
  cutoff := clock_timestamp();
  SELECT array_agg(id) INTO extension_ids FROM ethn.extensions WHERE booking_id = target;

  -- Signed upload URLs can outlive their reservation. Sweep again after their two-hour lifetime.
  WITH proofs AS (
    SELECT id, object_path FROM ethn.proof_reservations WHERE booking_id = target
    UNION ALL SELECT id, object_path FROM ethn.extension_proofs WHERE extension_id = ANY(extension_ids)
  ), queued AS (
    INSERT INTO ethn.deleted_booking_proofs (object_path, booking_id, final_after)
    SELECT object_path, target, cutoff + interval '3 hours' FROM proofs
    ON CONFLICT (object_path) DO NOTHING
    RETURNING object_path
  ) SELECT array_agg(id::text), EXISTS (SELECT 1 FROM queued) INTO proof_ids, has_proofs FROM proofs;

  WITH intervals AS MATERIALIZED (
    SELECT id, interval_minutes, false AS extension FROM ethn.booking_items WHERE booking_id = target
    UNION ALL SELECT id, interval_minutes, true FROM ethn.extension_items WHERE extension_id = ANY(extension_ids)
  ), removed AS (
    DELETE FROM ethn.court_allocations a
    USING intervals i
    WHERE (NOT i.extension AND i.id = a.item_id) OR (i.extension AND i.id = a.extension_item_id)
    RETURNING a.court_id, a.starts_at, a.ends_at, a.state, a.expires_at, i.interval_minutes
  ), retained AS (
    INSERT INTO ethn.court_blocks (id, court_id, starts_at, ends_at, kind, reason, created_by)
    SELECT gen_random_uuid(), court_id, slot_start, least(ends_at, slot_start + slot_width), 'deleted_booking', 'Slot already in progress', owner_id
    FROM removed
    CROSS JOIN LATERAL (SELECT make_interval(mins => interval_minutes) AS slot_width) width
    CROSS JOIN LATERAL (SELECT date_bin(slot_width, cutoff, starts_at) AS slot_start) slot
    WHERE starts_at <= cutoff AND ends_at > cutoff
      AND (state IN ('pending','confirmed','completed') OR (state = 'held' AND expires_at > cutoff))
    RETURNING id, court_id, starts_at, ends_at
  ) INSERT INTO ethn.court_allocations (id, block_id, court_id, starts_at, ends_at, state)
    SELECT gen_random_uuid(), id, court_id, starts_at, ends_at, 'confirmed' FROM retained;

  DELETE FROM ethn.booking_open_plays WHERE booking_id = target;
  DELETE FROM ethn.booking_refunds WHERE booking_id = target;
  DELETE FROM ethn.payments WHERE booking_id = target OR extension_id = ANY(extension_ids);
  DELETE FROM ethn.extension_proofs WHERE extension_id = ANY(extension_ids);
  DELETE FROM ethn.extension_items WHERE extension_id = ANY(extension_ids);
  DELETE FROM ethn.extensions WHERE booking_id = target;
  DELETE FROM ethn.proof_reservations WHERE booking_id = target;
  DELETE FROM ethn.booking_items WHERE booking_id = target;
  DELETE FROM ethn.email_outbox WHERE booking_id = target;
  DELETE FROM ethn.notifications WHERE link IN ('/admin/bookings/' || target, '/admin/bookings?booking=' || target);
  DELETE FROM ethn.audit WHERE booking_id = target;
  -- Keep keys/fingerprints to prevent a replay from recreating the booking; erase saved payloads.
  UPDATE ethn.idempotency SET result = NULL
    WHERE result->>'bookingId' = target::text OR result->>'checkoutId' = target::text
      OR result->>'extensionId' = ANY(extension_ids::text[])
      OR result->>'reservationId' = ANY(proof_ids) OR result->>'proofId' = ANY(proof_ids);
  DELETE FROM ethn.bookings WHERE id = target;
  INSERT INTO ethn.audit (actor, action, detail)
    VALUES (owner_id, 'booking.delete', jsonb_build_object('bookingId', target, 'reason', btrim(deletion_reason)));
  RETURN has_proofs;
END;
$$;
REVOKE ALL ON FUNCTION ethn.permanently_delete_booking(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ethn.permanently_delete_booking(uuid, uuid, text) TO ethn_checkout;
