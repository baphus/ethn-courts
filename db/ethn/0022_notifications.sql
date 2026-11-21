-- Fresh ETHN chain and separately reviewed existing ETHN upgrade only.
-- Inbox events contain no customer, payment, proof or tracking data.
create table ethn.notifications (
  id uuid primary key,
  recipient uuid not null references ethn.staff_access(user_id),
  event_key text not null check (length(event_key) between 1 and 160),
  title text not null check (length(title) between 1 and 120),
  body text not null check (length(body) between 1 and 240),
  link text not null check (link = '/admin/exceptions' or link ~ '^/admin/bookings/[0-9a-f-]{36}$'),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  unique (recipient, event_key)
);
create index notifications_recipient_created on ethn.notifications(recipient, created_at desc, id desc);
alter table ethn.notifications enable row level security;
revoke all on ethn.notifications from public, anon, authenticated;
grant select (id, recipient, event_key, title, body, link, created_at, read_at) on ethn.notifications to ethn_checkout;
grant insert (id, recipient, event_key, title, body, link) on ethn.notifications to ethn_checkout;
grant update (read_at) on ethn.notifications to ethn_checkout;
create policy notifications_select on ethn.notifications for select to ethn_checkout using (true);
create policy notifications_insert on ethn.notifications for insert to ethn_checkout with check (true);
create policy notifications_update_read on ethn.notifications for update to ethn_checkout using (true) with check (true);
