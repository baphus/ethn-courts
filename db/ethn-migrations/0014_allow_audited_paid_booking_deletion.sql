-- Reuse the owner-checked deletion, including its detached audit entry and slot/proof cleanup.
CREATE OR REPLACE FUNCTION ethn.permanently_delete_booking(target uuid, owner_id uuid, deletion_reason text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  RETURN ethn.permanently_delete_unpaid_booking_rows(target, owner_id, deletion_reason);
END;
$$;
