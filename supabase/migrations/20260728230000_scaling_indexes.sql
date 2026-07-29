-- pool_members filtered by user_id alone (dashboard load, contacts, profile page) can't
-- use the existing (pool_id, user_id) unique index — pool_id is the leading column.
create index if not exists idx_pool_members_user_id on public.pool_members (user_id);

-- pool_invitations filtered by invited_user_id + status alone (dashboard pending-invites
-- check, every load) can't use the existing (pool_id, invited_user_id) unique index.
create index if not exists idx_pool_invitations_invited_user_status on public.pool_invitations (invited_user_id, status);

-- messages has no index beyond its primary key; every chat open filters by pool_id and
-- orders by created_at, and it's one of the fastest-growing, most write-heavy tables.
create index if not exists idx_messages_pool_id_created_at on public.messages (pool_id, created_at desc);

-- predictions_v2 has two identical unique constraints on the same four columns — pure
-- duplicated storage and write overhead on what'll be the largest table by far.
-- predictions_v2_pool_id_user_id_fixture_id_category_id_key stays and covers the same
-- columns, so no application behavior changes.
alter table public.predictions_v2 drop constraint if exists predictions_v2_unique;
