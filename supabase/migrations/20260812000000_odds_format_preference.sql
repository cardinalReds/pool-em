-- Per-user display preference for the blurred odds badge on fixture/fight cards.
-- Purely cosmetic (formats the same underlying decimal odds already stored on
-- fixtures) -- no scoring or prediction logic reads this.
alter table public.profiles add column if not exists odds_format text not null default 'decimal'
  check (odds_format in ('decimal', 'american', 'fractional'));
