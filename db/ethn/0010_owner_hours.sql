grant insert, delete on ethn.court_hours to ethn_checkout;
grant usage on sequence ethn.court_hours_id_seq to ethn_checkout;
create policy court_hours_insert on ethn.court_hours for insert to ethn_checkout with check (true);
create policy court_hours_delete on ethn.court_hours for delete to ethn_checkout using (true);
