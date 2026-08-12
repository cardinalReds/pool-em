-- Companion to odds_format: lets a user turn off the blur entirely instead of tapping
-- to reveal every single fixture's odds every time they load the page.
alter table public.profiles add column if not exists odds_always_visible boolean not null default false;
