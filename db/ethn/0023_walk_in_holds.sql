-- Staff-owned walk-in holds; actor binding is server written and never exposed to clients.
alter table ethn.bookings add column walk_in_actor uuid references ethn.staff_access(user_id);
grant select (walk_in_actor) on ethn.bookings to ethn_checkout;
create policy walk_in_allocation_confirm on ethn.court_allocations for update to ethn_checkout using (state='held' AND item_id IN (SELECT id FROM ethn.booking_items WHERE booking_id IN (SELECT id FROM ethn.bookings WHERE walk_in_actor IS NOT NULL))) with check (state='confirmed');
grant insert (walk_in_actor) on ethn.bookings to ethn_checkout;
grant update (status) on ethn.bookings to ethn_checkout;
create policy walk_in_confirm on ethn.bookings for update to ethn_checkout using (status = 'held' and walk_in_actor is not null) with check (status = 'confirmed' and walk_in_actor is not null);
