-- Keep original descriptions on existing sales; no category is inferred.
alter table ethn.sales
  alter column description drop not null,
  add column item_name text check (length(btrim(item_name)) between 1 and 160),
  add column category text check (category in ('Food & Drinks', 'Equipment Rentals', 'Merchandise', 'Other')),
  add constraint sales_item_details check (
    (item_name is not null and category is not null)
    or (item_name is null and category is null and description is not null)
  );

grant select (item_name, category), insert (item_name, category) on ethn.sales to ethn_checkout;
