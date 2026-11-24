ALTER TABLE ethn.expenses DROP CONSTRAINT expenses_category_check, DROP CONSTRAINT expenses_amount_check;
ALTER TABLE ethn.expenses ADD COLUMN description text CHECK (length(description)<=2000), ADD COLUMN vendor text CHECK (length(vendor)<=160), ADD COLUMN notes text CHECK (length(notes)<=2000), ADD COLUMN revision uuid;
ALTER TABLE ethn.expenses ADD CONSTRAINT expenses_category_check CHECK (category IN ('Other','Utilities','Maintenance','Supplies','Staff','Rent','Payroll/Contractors','Maintenance & Repairs','Supplies & Equipment','Marketing','Software/Subscriptions','Taxes & Fees')),
  ADD CONSTRAINT expenses_amount_check CHECK (amount>0 OR (amount=0 AND revision IS NOT NULL));
GRANT SELECT(description,vendor,notes,revision), INSERT(description,vendor,notes), UPDATE(title,category,amount,paid_date,description,vendor,notes,revision), DELETE ON ethn.expenses TO ethn_checkout;
ALTER TABLE ethn.expense_corrections DROP CONSTRAINT expense_corrections_expense_id_fkey,
  ADD CONSTRAINT expense_corrections_expense_id_fkey FOREIGN KEY(expense_id) REFERENCES ethn.expenses(id) ON DELETE CASCADE;
CREATE POLICY expenses_delete ON ethn.expenses FOR DELETE TO ethn_checkout USING (true);
