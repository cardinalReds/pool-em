-- 1:1 direct messages between pool-mates only — matches the same privacy boundary as
-- /dashboard/u/[userId] (never surfaces anything to someone you don't share a pool with).
-- No group threads: a conversation is always exactly two users, normalized user_a < user_b
-- so the same pair can never end up with two separate conversation rows.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint conversations_ordered_pair check (user_a < user_b),
  constraint conversations_unique_pair unique (user_a, user_b)
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists direct_messages_conversation_id_created_at_idx on public.direct_messages (conversation_id, created_at);

-- Two users can message each other only if they currently share at least one pool —
-- checked once at conversation-creation time, not re-checked per message (an existing
-- contact stays reachable even if you later leave the shared pool, same as any other
-- messaging app).
create or replace function public.share_a_pool(uid1 uuid, uid2 uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from (
      select pool_id as pid from public.pool_members where user_id = uid1
      union
      select id as pid from public.pools where admin_id = uid1
    ) a
    join (
      select pool_id as pid from public.pool_members where user_id = uid2
      union
      select id as pid from public.pools where admin_id = uid2
    ) b on a.pid = b.pid
  );
$$;

alter table public.conversations enable row level security;
alter table public.direct_messages enable row level security;

create policy "Participants can view their conversations" on public.conversations for select
  using (auth.uid() = user_a or auth.uid() = user_b);

create policy "Users can start a conversation with a pool-mate" on public.conversations for insert
  with check (
    (auth.uid() = user_a or auth.uid() = user_b)
    and public.share_a_pool(user_a, user_b)
  );

create policy "Participants can view direct messages in their conversations" on public.direct_messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = direct_messages.conversation_id
      and (auth.uid() = c.user_a or auth.uid() = c.user_b)
    )
  );

create policy "Participants can send direct messages in their conversations" on public.direct_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = direct_messages.conversation_id
      and (auth.uid() = c.user_a or auth.uid() = c.user_b)
    )
  );

-- Only the recipient marks a message read (not the sender), and only within a
-- conversation they're actually part of.
create policy "Recipients can mark direct messages read" on public.direct_messages for update
  using (
    sender_id != auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = direct_messages.conversation_id
      and (auth.uid() = c.user_a or auth.uid() = c.user_b)
    )
  )
  with check (
    sender_id != auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = direct_messages.conversation_id
      and (auth.uid() = c.user_a or auth.uid() = c.user_b)
    )
  );
