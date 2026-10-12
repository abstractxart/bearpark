-- 007: honey_points_activity.points holds honey as it is credited (2 decimals).
--
-- supabase-beardrops-setup.sql made `points` INTEGER, but games pay by the tenth
-- of a minute (2.5 minutes = 2.5 honey). The server inserts `$2::numeric`, so
-- Postgres ROUNDED every game credit into the column: 2.5 was logged as 3, 0.5 as 1.
-- That log is what BEARdrops reads ("honey earned today", /api/honey-points/24h,
-- the claim check), so short sessions of x.5 minutes inflated it by up to 2x and
-- it never matched honey_ledger. (The PostgREST fallback path failed outright on
-- a fraction and lost the row.)
--
-- Safe to run any time, and more than once. Existing rows keep their values.
-- Nothing else needs to change: every reader sums the column with parseFloat,
-- and get_honey_points_24h() still returns an integer (it rounds the sum once).

ALTER TABLE honey_points_activity
  ALTER COLUMN points TYPE NUMERIC(14, 2) USING points::numeric;
