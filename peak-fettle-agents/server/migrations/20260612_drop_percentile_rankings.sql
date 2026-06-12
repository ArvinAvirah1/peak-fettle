-- 20260612 — Drop server-side percentile ranking infrastructure
--
-- APPLY ONLY AFTER device-test verification — founder gate.
--
-- Percentile computation has moved on-device (strengthModelV3.ts, Agent N).
-- The server tables are no longer needed once device-side results are
-- confirmed correct in production. Do NOT fold this file into db/schema.sql.
--
-- Prerequisites before running:
--   1. EAS build with strengthModelV3 is live and percentile output verified.
--   2. PowerSync sync-rules.yaml no longer syncs percentile_vectors or
--      user_percentile_rankings (already done — see 20260612 sync-rules update).
--   3. Founder explicitly confirms.
--
-- Idempotent: all drops use IF EXISTS.

DROP VIEW  IF EXISTS v_user_lift_inputs;
DROP FUNCTION IF EXISTS compute_percentile_batch();
DROP TABLE IF EXISTS user_percentile_rankings;
DROP TABLE IF EXISTS percentile_vectors;
