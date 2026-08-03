-- Follow-up to the earlier RLS audit: these three tables had RLS enabled with zero
-- policies, which for a table nobody reads client-side just means "locked to service
-- role" (fine, matches fixture_venues' actual dormant state — left untouched). But
-- messages, round_facts, and bracket_scoring_rules are all read/written directly from
-- the browser client (ShitChat, FixturesList, the pool page, and pool creation), so
-- zero policies meant those features were silently non-functional — every read
-- returning empty and every write failing. Not a security gap, a functional one:
-- default-deny with no policies blocks legitimate access same as illegitimate.

-- messages ("shit chat") — pool members only, matching predictions_v2's membership pattern.
create policy "Members can view messages" on public.messages
  for select using (
    exists (select 1 from pool_members where pool_members.pool_id = messages.pool_id::uuid and pool_members.user_id = auth.uid())
  );

create policy "Members can send messages" on public.messages
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from pool_members where pool_members.pool_id = messages.pool_id::uuid and pool_members.user_id = auth.uid())
  );

-- Reactions are collaborative (anyone in the pool can react to anyone's message) — the
-- app's own update call only ever touches the `reactions` column in practice.
create policy "Members can react to messages" on public.messages
  for update using (
    exists (select 1 from pool_members where pool_members.pool_id = messages.pool_id::uuid and pool_members.user_id = auth.uid())
  );

-- round_facts — tournament-wide actual results (clean sheets, red cards, etc.), same
-- "anyone can view" openness as fixtures/f1_sessions; never written from the client.
create policy "Anyone can view round facts" on public.round_facts
  for select using (true);

-- bracket_scoring_rules — same admin/member split as pool_rules.
create policy "Members can view bracket scoring rules" on public.bracket_scoring_rules
  for select using (
    exists (select 1 from pool_members where pool_members.pool_id = bracket_scoring_rules.pool_id and pool_members.user_id = auth.uid())
  );

create policy "Admins can manage bracket scoring rules" on public.bracket_scoring_rules
  for all using (
    exists (select 1 from pools where pools.id = bracket_scoring_rules.pool_id and pools.admin_id = auth.uid())
  );
