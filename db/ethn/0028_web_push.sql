-- Fresh ETHN chain and separately reviewed existing ETHN upgrade only.
create table ethn.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references ethn.staff_access(user_id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 1 and 2048),
  p256dh text not null check (length(p256dh) between 80 and 100),
  auth text not null check (length(auth) between 20 and 30),
  created_at timestamptz not null default clock_timestamp(),
  disabled_at timestamptz
);
create index push_subscriptions_user on ethn.push_subscriptions(user_id) where disabled_at is null;
create table ethn.push_deliveries (
  notification_id uuid not null references ethn.notifications(id) on delete cascade,
  subscription_id uuid not null references ethn.push_subscriptions(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','sent','dead')),
  attempts integer not null default 0 check(attempts between 0 and 5),
  next_attempt_at timestamptz not null default clock_timestamp(),
  claimed_at timestamptz,
  primary key(notification_id, subscription_id)
);
create index push_deliveries_due on ethn.push_deliveries(next_attempt_at) where status='pending';
alter table ethn.push_subscriptions enable row level security;
alter table ethn.push_deliveries enable row level security;
revoke all on ethn.push_subscriptions, ethn.push_deliveries from public, anon, authenticated;
grant select (id,user_id,endpoint,p256dh,auth,created_at,disabled_at) on ethn.push_subscriptions to ethn_checkout;
grant insert (user_id,endpoint,p256dh,auth) on ethn.push_subscriptions to ethn_checkout;
grant update (p256dh,auth,disabled_at) on ethn.push_subscriptions to ethn_checkout;
grant select (notification_id,subscription_id,status,attempts,next_attempt_at,claimed_at) on ethn.push_deliveries to ethn_checkout;
grant insert (notification_id,subscription_id) on ethn.push_deliveries to ethn_checkout;
grant update (status,attempts,next_attempt_at,claimed_at) on ethn.push_deliveries to ethn_checkout;
create policy push_subscriptions_access on ethn.push_subscriptions for all to ethn_checkout using(true) with check(true);
create policy push_deliveries_select on ethn.push_deliveries for select to ethn_checkout using(true);
create policy push_deliveries_insert on ethn.push_deliveries for insert to ethn_checkout with check(true);
create policy push_deliveries_update on ethn.push_deliveries for update to ethn_checkout using(true) with check(true);
