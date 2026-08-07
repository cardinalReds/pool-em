-- Backs auto-mirroring of a private pool's members/ghosts into a matching public pool
-- (same tournament, public pool's scored categories all present in the private pool).
-- Real members mirror as a second, ordinary pool_members row (self-insert, already legal
-- under "Users can join pools"). Ghosts can't self-insert anywhere, and per product
-- decision a ghost only ever lives in one private pool — its public-pool presence is a
-- separate mirror row, linked back here so a pick entered for the private ghost can be
-- silently copied onto its mirror's predictions_v2 rows.
alter table public.ghost_entries add column if not exists source_ghost_entry_id uuid references public.ghost_entries(id) on delete cascade;
create index if not exists idx_ghost_entries_source on public.ghost_entries (source_ghost_entry_id) where source_ghost_entry_id is not null;
