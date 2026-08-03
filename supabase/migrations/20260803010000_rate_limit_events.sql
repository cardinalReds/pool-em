-- Backs a simple sliding-window rate limiter (lib/rateLimit.ts) for public-facing send
-- endpoints (password reset codes, invite emails/SMS) — none of them had any limit
-- before this, so a single caller could hammer them for spam or to run up Resend/Twilio
-- costs. Service-role only, same pattern as players/fixture_venues: RLS enabled, zero
-- policies, since nothing here is ever read or written from the browser client.
create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  key text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_events_key_created_idx on public.rate_limit_events (key, created_at);
alter table public.rate_limit_events enable row level security;
