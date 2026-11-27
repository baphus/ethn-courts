ALTER FUNCTION ethn.permanently_delete_booking(uuid, uuid, text) RENAME TO permanently_delete_unpaid_booking_rows;
REVOKE EXECUTE ON FUNCTION ethn.permanently_delete_unpaid_booking_rows(uuid, uuid, text) FROM ethn_checkout;
--> statement-breakpoint
CREATE FUNCTION ethn.permanently_delete_booking(target uuid, owner_id uuid, deletion_reason text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM 1 FROM ethn.staff_access WHERE user_id = owner_id AND enabled AND role = 'owner' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM id FROM ethn.courts ORDER BY id FOR UPDATE;
  PERFORM id FROM ethn.bookings WHERE id = target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  PERFORM id FROM ethn.extensions WHERE booking_id = target ORDER BY id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM ethn.payments p WHERE p.status = 'accepted'
    AND (p.booking_id = target OR p.extension_id IN (SELECT id FROM ethn.extensions WHERE booking_id = target)))
    OR EXISTS (SELECT 1 FROM ethn.booking_refunds WHERE booking_id = target) THEN
    RAISE EXCEPTION 'ACTION_CONFLICT';
  END IF;
  RETURN ethn.permanently_delete_unpaid_booking_rows(target, owner_id, deletion_reason);
END;
$$;
REVOKE ALL ON FUNCTION ethn.permanently_delete_booking(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ethn.permanently_delete_booking(uuid, uuid, text) TO ethn_checkout;
--> statement-breakpoint
CREATE FUNCTION ethn.queue_abandoned_booking_proofs()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  -- Deletion takes these locks before touching the proof queue and reservations.
  PERFORM id FROM ethn.courts ORDER BY id FOR UPDATE;
  WITH ready AS (
    SELECT p.id FROM ethn.proof_reservations p JOIN ethn.bookings b ON b.id = p.booking_id
    WHERE p.state = 'reserved' AND b.status IN ('held', 'expired')
      AND b.expires_at <= statement_timestamp() - interval '90 days'
      AND p.object_path ~ '^incoming/[0-9a-f]{64}\.(jpg|png|webp)$'
    ORDER BY b.expires_at, p.id LIMIT 25 FOR UPDATE OF p SKIP LOCKED
  ), retired AS (
    UPDATE ethn.proof_reservations p SET state = 'deleted'
    FROM ready WHERE p.id = ready.id
    RETURNING p.object_path, p.booking_id
  )
  INSERT INTO ethn.deleted_booking_proofs (object_path, booking_id, final_after, next_attempt)
  SELECT object_path, booking_id, statement_timestamp(), statement_timestamp() FROM retired
  ON CONFLICT (object_path) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION ethn.queue_abandoned_booking_proofs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ethn.queue_abandoned_booking_proofs() TO ethn_checkout;
