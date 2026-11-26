LOCK TABLE ethn.staff_access IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM ethn.audit AS promotion
    JOIN ethn.staff_access AS membership ON membership.user_id::text = promotion.detail->>'userId'
    WHERE promotion.actor = 'migration' AND promotion.action = 'owner.cutover'
      AND membership.enabled AND membership.role = 'owner'
      AND NOT EXISTS (
        SELECT 1 FROM ethn.audit AS grant_event
        WHERE grant_event.action = 'staff.update' AND grant_event.id > promotion.id
          AND grant_event.detail->>'userId' = membership.user_id::text
          AND grant_event.detail @> '{"oldEnabled":false,"newEnabled":true,"newRole":"owner"}'::jsonb
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ETHN_OWNER_ROSTER_REVIEW_REQUIRED';
  END IF;
END $$;
