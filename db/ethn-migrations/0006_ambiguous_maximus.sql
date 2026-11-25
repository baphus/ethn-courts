-- Operations cron can cancel pending bookings without changing payment evidence.
ALTER POLICY decision_booking ON ethn.bookings
  WITH CHECK (status IN ('confirmed', 'rejected', 'cancelled'));
--> statement-breakpoint
ALTER POLICY decision_allocation ON ethn.court_allocations
  WITH CHECK (state IN ('confirmed', 'rejected', 'cancelled'));
