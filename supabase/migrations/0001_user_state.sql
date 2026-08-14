-- 100MillClub cloud sync — the whole schema.
--
-- This migration documents (and can recreate) what is already live on the
-- Supabase project `waugpjyrkkkavrnqmmyk` (org "TKDL Free"). The app is
-- local-first: everything lives in the browser and syncs, whole, into one
-- JSONB row per signed-in user. One row, RLS-fenced, nothing shared.
--
-- Apply with: supabase db push   (or paste into the SQL editor)

create table if not exists public.user_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

-- each user reads exactly one row: their own
drop policy if exists "own row select" on public.user_state;
create policy "own row select"
  on public.user_state for select
  using (auth.uid() = user_id);

drop policy if exists "own row insert" on public.user_state;
create policy "own row insert"
  on public.user_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "own row update" on public.user_state;
create policy "own row update"
  on public.user_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- deletes stay server-side only (no policy on purpose)

-- What lives inside `data` (all optional, written by js/cloud.js SYNC_KEYS):
--   mc_trade_history, mc_positions, mc_pending_orders, mc_acct_cfg,
--   mc_equity_snaps, mc_realized_carry            — the funded demo account
--   mc_portfolio_tx, mc_portfolio_snaps           — the real-book Folio
--   mc_alerts                                     — alert definitions
--   mc_indicators, mc_custom_indicators           — chart indicator setups
--   mc_market, mc_recent_syms, mc_fav_syms,
--   mc_seen_syms, mc_custom_assets                — market mode, taste and
--                                                   search-added instruments
--   mc_symbol, mc_order, mc_layout, mc_chart_preset, mc_volume,
--   mc_yt_shelf, mc_yt_watched, mc_cal_watch, mc_cal_custom, mc_news_cfg,
--   mc_tour_done, mc_tv_follow, mc_default_micros, mc_first_order
--
-- Deliberately absent (the UI promises these stay on-device): mc_ai_cfg,
-- mc_alert_delivery, mc_yt_cfg, mc_quotes_cfg — they hold per-visitor API
-- keys and delivery secrets.
