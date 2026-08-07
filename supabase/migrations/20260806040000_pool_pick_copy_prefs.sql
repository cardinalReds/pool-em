-- Backs the one-time "copy my picks between these two pools automatically?" prompt.
-- Directional so lookups from either pool are a single indexed equality check; the app
-- writes both directions when a user answers the prompt, so it behaves symmetrically in
-- practice without needing an OR'd query. Never touched for ghosts — a ghost only ever
-- lives in one private pool, so its public-pool mirror (ghost_entries.source_ghost_entry_id)
-- is copied silently instead of going through this preference table.
create table public.pool_pick_copy_prefs (
  user_id uuid references auth.users(id) on delete cascade not null,
  from_pool_id uuid references public.pools(id) on delete cascade not null,
  to_pool_id uuid references public.pools(id) on delete cascade not null,
  enabled boolean not null,
  created_at timestamptz not null default now(),
  primary key (user_id, from_pool_id, to_pool_id)
);

alter table public.pool_pick_copy_prefs enable row level security;

create policy "Users can view their own copy prefs" on public.pool_pick_copy_prefs
  for select using (auth.uid() = user_id);

create policy "Users can set their own copy prefs" on public.pool_pick_copy_prefs
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own copy prefs" on public.pool_pick_copy_prefs
  for update using (auth.uid() = user_id);
