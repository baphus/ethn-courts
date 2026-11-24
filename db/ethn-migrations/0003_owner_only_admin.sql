LOCK TABLE ethn.staff_access IN ACCESS EXCLUSIVE MODE;
WITH promoted AS (
  UPDATE ethn.staff_access SET role = 'owner' WHERE enabled AND role = 'staff' RETURNING user_id
)
INSERT INTO ethn.audit(actor,action,detail)
SELECT 'migration','owner.cutover',jsonb_build_object('userId',user_id,'oldRole','staff','newRole','owner') FROM promoted;

-- Retain disabled historical Staff memberships and foreign keys, but never enable them as Staff.
ALTER TABLE ethn.staff_access ADD CONSTRAINT enabled_admin_is_owner CHECK (NOT enabled OR role = 'owner');
