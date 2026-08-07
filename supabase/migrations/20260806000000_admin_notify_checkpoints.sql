-- Backs /api/admin/notify (site-owner digest: new signups + new chat messages in pools
-- they administer). One row per feed, tracking the timestamp of the last item already
-- emailed so each cron run only picks up what's new. Service-role only, same pattern as
-- rate_limit_events: RLS enabled, zero policies, nothing here is ever touched from the
-- browser client.
create table public.admin_notify_checkpoints (
  key text primary key,
  last_seen_at timestamptz not null default now()
);
alter table public.admin_notify_checkpoints enable row level security;
