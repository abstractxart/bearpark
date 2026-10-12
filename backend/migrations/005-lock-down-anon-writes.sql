-- =====================================================================
-- 005: take every write away from the public anon key
-- =====================================================================
-- WHY: the Supabase anon key is public (it is served in admin-beardrops.html
-- and is public by design). The setup scripts in backend/ gave tables like
-- honey_points, daily_game_plays, raids, admin_roles and
-- honey_points_activity a policy "FOR ALL USING (true) WITH CHECK (true)",
-- and atomic_time_play() takes the daily cap as a PARAMETER and is granted
-- to anon. With those, anyone can mint honey straight through PostgREST
-- (PATCH /rest/v1/honey_points, POST /rest/v1/rpc/atomic_time_play,
-- INSERT into admin_roles, INSERT raids worth 1000 honey) and never touch the
-- API's locks. The scripts in backend/ that write honey with the anon key
-- (add-honey-points.js, set-all-points.js, ...) show those writes work today.
--
-- RUN ORDER (important):
--   1. Set SUPABASE_SERVICE_ROLE_KEY on Railway (BEARdrops claims already need it).
--   2. Deploy the backend whose writes go through the service role (`db` in
--      backend/server.js). Check the boot log has no
--      "SUPABASE_SERVICE_ROLE_KEY is not set" error.
--   3. THEN run this file in the Supabase SQL editor.
--   Running it before step 2 breaks every API write still made with the
--   anon key (profiles, comments, follows, bulletin, memes, raids ...).
--
-- WHAT IT DOES, for each listed table that exists:
--   - ENABLE ROW LEVEL SECURITY
--   - drops every INSERT / UPDATE / DELETE / ALL policy. An ALL policy also
--     granted reads, so it is replaced by a SELECT-only policy with the same
--     USING expression and roles: reads behave exactly as before.
--   - if RLS was OFF (everything readable), adds a SELECT USING (true) policy
--     so public reads keep working. Server-only tables get no read policy.
--   - REVOKE INSERT, UPDATE, DELETE, TRUNCATE from anon, authenticated, PUBLIC
-- and revokes EXECUTE on the honey/game/meme functions from the same roles.
-- service_role and the table owner keep full access. Idempotent: running it
-- again finds nothing left to change.
--
-- AFTERWARDS the old maintenance scripts in backend/ that use
-- SUPABASE_ANON_KEY for writes stop working; run them with the service key.
-- =====================================================================

DO $$
DECLARE
  -- Tables the site reads publicly: keep reads exactly as they are.
  public_read_tables TEXT[] := ARRAY[
    'honey_points', 'honey_points_activity', 'point_transactions', 'daily_game_plays',
    'raid_completions', 'raids', 'admin_roles',
    'user_cosmetics', 'cosmetics_transactions', 'cosmetics_catalog',
    'meme_submission_rewards', 'memes', 'meme_votes', 'meme_weeks',
    'nft_purchase_requests', 'store_token_transactions',
    'airdrop_snapshots', 'airdrop_transactions', 'airdrop_config',
    'lp_blacklist', 'lp_balance_history', 'wallet_blacklist', 'banned_users',
    'game_settings', 'admin_activity_logs', 'game_leaderboards',
    'profiles', 'profile_comments', 'comment_reactions', 'notifications', 'follows',
    'push_subscriptions', 'bulletin_posts', 'bulletin_comments',
    'bulletin_comment_reactions', 'bulletin_post_reactions',
    'merch_orders', 'merch_inventory', 'users', 'tweets', 'pending_tweets'
  ];
  -- Read and written only by the API (Postgres owner / service role).
  private_tables TEXT[] := ARRAY['game_reward_sessions', 'twitter_connections', 'honey_ledger'];
  t TEXT;
  pol RECORD;
  had_rls BOOLEAN;
  is_private BOOLEAN;
  read_name TEXT;
  role_list TEXT;
  has_anon BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon');
  has_authenticated BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
BEGIN
  FOREACH t IN ARRAY public_read_tables || private_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'skip %: no such table', t;
      CONTINUE;
    END IF;
    is_private := t = ANY (private_tables);

    SELECT c.relrowsecurity INTO had_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = t;

    -- Write policies go. An ALL policy's read half is kept as SELECT-only.
    FOR pol IN
      SELECT policyname, cmd, roles, qual
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
    LOOP
      IF pol.cmd = 'ALL' AND NOT is_private THEN
        read_name := left(pol.policyname, 48) || ' (read only)';
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = read_name) THEN
          role_list := array_to_string(ARRAY(SELECT quote_ident(r) FROM unnest(pol.roles) AS r), ', ');
          EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO %s USING (%s)',
                         read_name, t, role_list, COALESCE(pol.qual, 'true'));
        END IF;
      END IF;
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
      RAISE NOTICE '%: dropped % policy "%"', t, pol.cmd, pol.policyname;
    END LOOP;

    IF NOT had_rls THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      RAISE NOTICE '%: row level security enabled (was off)', t;
      IF NOT is_private AND NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND cmd IN ('SELECT', 'ALL')
      ) THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (true)', 'public read (kept by 005)', t);
      END IF;
    END IF;

    IF is_private THEN
      -- No anon access at all; drop any read policy too.
      FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
        EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
      END LOOP;
      EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
      IF has_anon THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon', t); END IF;
      IF has_authenticated THEN EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t); END IF;
    ELSE
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM PUBLIC', t);
      IF has_anon THEN EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon', t); END IF;
      IF has_authenticated THEN EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated', t); END IF;
    END IF;
  END LOOP;
END $$;

-- Functions that credit honey, count game minutes or votes, or delete data.
-- atomic_time_play(p_wallet, p_game, p_date, p_max_minutes, p_minutes_played)
-- trusts every argument, including the cap; only the API may call it.
DO $$
DECLARE
  fn RECORD;
  has_anon BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon');
  has_authenticated BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
  has_service BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role');
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prorettype <> 'trigger'::regtype
      AND p.proname = ANY (ARRAY[
        'atomic_time_play', 'atomic_game_play_v2', 'atomic_increment_game_play',
        'record_honey_activity', 'increment_meme_votes', 'create_initial_meme_week',
        'cleanup_old_game_plays', 'cleanup_old_notifications'
      ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn.sig);
    IF has_anon THEN EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn.sig); END IF;
    IF has_authenticated THEN EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', fn.sig); END IF;
    IF has_service THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig); END IF;
    RAISE NOTICE 'execute revoked from anon/authenticated: %', fn.sig;
  END LOOP;

  -- Report what anon can still call, so nothing unexpected hides here.
  IF has_anon THEN
    FOR fn IN
      SELECT p.oid::regprocedure AS sig, p.prosecdef
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prorettype <> 'trigger'::regtype
        AND has_function_privilege('anon', p.oid, 'EXECUTE')
    LOOP
      RAISE NOTICE 'anon can still EXECUTE % %', fn.sig,
        CASE WHEN fn.prosecdef THEN '-- SECURITY DEFINER: review it' ELSE '' END;
    END LOOP;
  END IF;
END $$;

-- Optional, recommended once you are happy with the above: tables created in
-- future by the postgres role should not hand the anon key write access.
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon, authenticated;
--
-- Check the result:
--   SELECT tablename, policyname, cmd, roles, qual FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2;
--   SELECT table_name, privilege_type FROM information_schema.role_table_grants
--    WHERE grantee IN ('anon', 'authenticated') AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
--   (the second query should return no rows)
