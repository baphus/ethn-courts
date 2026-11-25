-- Separate time blocks may share a court; court_allocations still excludes overlaps.
ALTER TABLE ethn.booking_items DROP CONSTRAINT booking_items_booking_id_court_id_key;
CREATE INDEX booking_items_booking_id_idx ON ethn.booking_items (booking_id);
