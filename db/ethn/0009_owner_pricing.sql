-- Fresh ETHN schema after 0008; shared role requires server-side owner authorization.
grant update (merchant, version) on ethn.settings to ethn_checkout;
grant update (name) on ethn.courts to ethn_checkout;
grant update (hourly_rate) on ethn.court_hours to ethn_checkout;
create policy checkout_hours_update on ethn.court_hours for update to ethn_checkout using (true) with check (true);
