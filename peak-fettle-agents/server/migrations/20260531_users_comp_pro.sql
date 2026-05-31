-- 20260531_users_comp_pro.sql
-- Permanent manual/promo Pro grants (comp accounts for promoters, friends, etc.).
--
-- `tier` ('free'|'paid') stays the EFFECTIVE entitlement that requirePaid checks.
-- `comp_pro` records WHY someone is paid: TRUE = manually comped (no billing),
-- permanent until explicitly revoked. This keeps comps safe once real billing
-- (RevenueCat + Apple IAP) is added later:
--
--   * Comping a user:   UPDATE users SET tier='paid', comp_pro=TRUE  WHERE ...
--   * Revoking a comp:  UPDATE users SET tier='free', comp_pro=FALSE WHERE ...
--   * FUTURE RevenueCat webhook MUST honor comps — never downgrade a comp:
--       UPDATE users SET tier = CASE
--           WHEN comp_pro THEN 'paid'
--           WHEN <has_active_subscription> THEN 'paid'
--           ELSE 'free' END
--     and must never charge a comped account.
--
-- Idempotent. Apply in the Supabase SQL Editor.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS comp_pro BOOLEAN NOT NULL DEFAULT FALSE;
