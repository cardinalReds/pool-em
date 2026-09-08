-- Tracks external-sync problems that would otherwise fail silently forever (e.g. an
-- api-sports product sitting on a plan that doesn't cover the current season — the exact
-- failure that let F1 go unscored all season with nothing ever surfacing it). One row per
-- issue key (e.g. "f1_live"); reportSyncIssue()/clearSyncIssue() in lib/syncHealth.ts own
-- the read/write. Service-role only, same pattern as admin_notify_checkpoints: RLS
-- enabled, zero policies, nothing here is ever touched from the browser client.
create table public.sync_issues (
  key text primary key,
  message text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  notified_at timestamptz,
  resolved_at timestamptz
);
alter table public.sync_issues enable row level security;
