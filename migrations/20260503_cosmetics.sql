-- migrations/20260503_cosmetics.sql
-- Phase: D (Character Customization + Cosmetic Shop)
-- Author: dev-database
-- Date: 2026-05-03
--
-- Implements the full data model for the cosmetic catalog and user loadout:
--
--   cosmetic_items         Global catalog of all purchasable/default items
--   user_cosmetics         Per-user ownership ledger (acquired items)
--   user_equipped_cosmetics  Active loadout: one row per user per slot
--
-- Categories (4):
--   'avatar'  — base portrait art for the user's character
--   'frame'   — decorative border around the avatar on profile cards
--   'badge'   — equippable text/icon tag shown under the username
--   'theme'   — UI color palette that re-skins the app for that user
--
-- Rarity tiers and default credit prices (§ calibration pending cosmetic list):
--   'common'     — 100 credits  (~2 successful streak-weeks at base rate)
--   'rare'       — 300 credits  (~6 streak-weeks)
--   'legendary'  — 750 credits  (~10 streak-weeks, roughly one multiplied run)
--
-- Default items (is_default = TRUE):
--   Available to every user at no cost. Users can equip defaults without
--   owning them — the equip endpoint checks is_default OR ownership.
--
-- Metadata JSONB shape by category:
--   avatar : { "image_url": "...", "alt_text": "..." }
--   frame  : { "image_url": "...", "color_hex": "#RRGGBB" }
--   badge  : { "label": "...", "icon": "...", "color_hex": "#RRGGBB" }
--   theme  : { "primary": "#...", "secondary": "#...", "accent": "#...",
--               "surface": "#...", "on_primary": "#..." }
--
-- Conventions (matching initial_schema.sql):
--   * UUID primary keys via gen_random_uuid()
--   * TIMESTAMPTZ for all timestamps
--   * RLS enabled; service role handles seed writes
--   * set_updated_at() already defined in 20260430_initial_schema.sql
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- SECTION 1: Cosmetic items catalog
-- Global table; not user-scoped. Managed via service role / admin tool.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cosmetic_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    description   TEXT NOT NULL DEFAULT '',
    category      TEXT NOT NULL CHECK (category IN ('avatar', 'frame', 'badge', 'theme')),
    rarity        TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'legendary')),
    price_credits INT  NOT NULL CHECK (price_credits >= 0),
    -- is_default: TRUE → item is free and available to all users without purchase.
    -- Default items cannot be purchased (price_credits is ignored for them).
    is_default    BOOLEAN NOT NULL DEFAULT FALSE,
    -- is_active: FALSE → item is de-listed from the shop (legacy items stay in DB).
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    -- Visual / functional data; shape varies by category (see header).
    metadata      JSONB NOT NULL DEFAULT '{}',
    sort_order    INT  NOT NULL DEFAULT 0,  -- lower = earlier in shop listing
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shop listing query: active items, ordered by category → rarity → sort_order
CREATE INDEX IF NOT EXISTS idx_cosmetic_items_shop
    ON cosmetic_items (category, rarity, sort_order)
    WHERE is_active = TRUE;

-- Cosmetic items are globally readable (no RLS needed for SELECT).
-- All writes come from the service role.
-- No RLS on cosmetic_items intentionally — it is a public catalog.
--
-- !!  WRITE-GUARD — DO NOT ADD INSERT / UPDATE / DELETE RLS POLICIES HERE  !!
-- Adding any write policy (even a restrictive one) to cosmetic_items would
-- allow authenticated users to potentially flip is_default = TRUE on paid
-- items, bypassing the credit-purchase requirement for premium cosmetics.
-- All catalog mutations must go through the service role (admin tooling only).
-- If anonymous shop preview requirements change in Phase E, open a separate
-- migration and get a security review before touching this table's RLS state.

-- ---------------------------------------------------------------------------
-- SECTION 2: User cosmetics (ownership ledger)
-- One row per (user, item) when the user owns the item.
-- Defaults are owned by everyone implicitly (no row needed — checked in API).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_cosmetics (
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id            UUID NOT NULL REFERENCES cosmetic_items(id),
    acquired_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acquisition_source TEXT NOT NULL DEFAULT 'purchase'
                           CHECK (acquisition_source IN ('purchase', 'admin_grant')),
    PRIMARY KEY (user_id, item_id)
);

-- User's owned items list (shop "owned" badge + equip permission check)
CREATE INDEX IF NOT EXISTS idx_user_cosmetics_user
    ON user_cosmetics (user_id, acquired_at DESC);

ALTER TABLE user_cosmetics ENABLE ROW LEVEL SECURITY;

-- Users can only see their own inventory.
CREATE POLICY "user_cosmetics_self_select" ON user_cosmetics
    FOR SELECT USING (auth.uid() = user_id);

-- Purchase writes come from application code (service role call in transaction).
-- No direct client INSERT — balance check must be atomic.

-- ---------------------------------------------------------------------------
-- SECTION 3: User equipped cosmetics (active loadout)
-- One row per (user, slot). Slot = category name.
-- A NULL item_id is not stored — absence of a row means "no item equipped"
-- (the app falls back to the category's default item).
-- Constraint: equipped item must be owned by the user OR be a default item.
--   Enforced at the application layer (not in SQL) to keep the constraint
--   readable and to avoid a complex cross-table CHECK.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_equipped_cosmetics (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot       TEXT NOT NULL CHECK (slot IN ('avatar', 'frame', 'badge', 'theme')),
    item_id    UUID NOT NULL REFERENCES cosmetic_items(id),
    equipped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, slot)
);

-- Profile display: fetch a user's full equipped loadout in one scan
CREATE INDEX IF NOT EXISTS idx_user_equipped_user
    ON user_equipped_cosmetics (user_id);

ALTER TABLE user_equipped_cosmetics ENABLE ROW LEVEL SECURITY;

-- Anyone can read a user's equipped cosmetics (needed for group roster display).
CREATE POLICY "user_equipped_public_read" ON user_equipped_cosmetics
    FOR SELECT USING (TRUE);

-- Only the owning user can change their own loadout.
CREATE POLICY "user_equipped_self_write" ON user_equipped_cosmetics
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- SECTION 4: Seed data — initial cosmetic catalog
-- 16 items across 4 categories × 3-4 rarities.
-- image_url values are placeholders; replace with CDN URLs before launch.
-- color_hex values are production-ready.
-- All non-default items priced at tier defaults (common=100, rare=300, legendary=750).
-- ---------------------------------------------------------------------------

-- Helper: ensure the seed is idempotent (re-running migration is safe).
-- We insert with ON CONFLICT DO NOTHING so re-runs skip existing rows.

-- ── Avatars ────────────────────────────────────────────────────────────────
INSERT INTO cosmetic_items (name, description, category, rarity, price_credits, is_default, metadata, sort_order)
VALUES
    -- Default avatar: always available, no purchase needed
    ('Rookie',
     'The default athlete. Everyone starts here.',
     'avatar', 'common', 0, TRUE,
     '{"image_url": "/assets/cosmetics/avatars/rookie.png", "alt_text": "A determined beginner athlete"}',
     0),
    ('Iron Grinder',
     'Consistent. Methodical. Always shows up.',
     'avatar', 'common', 100, FALSE,
     '{"image_url": "/assets/cosmetics/avatars/iron_grinder.png", "alt_text": "A focused weightlifter mid-set"}',
     10),
    ('Morning Pacer',
     'Up before the sun. Fastest in the early-morning cohort.',
     'avatar', 'common', 100, FALSE,
     '{"image_url": "/assets/cosmetics/avatars/morning_pacer.png", "alt_text": "A runner at dawn"}',
     20),
    ('Power Block',
     'Rare power athlete. Trains heavy, recovers smart.',
     'avatar', 'rare', 300, FALSE,
     '{"image_url": "/assets/cosmetics/avatars/power_block.png", "alt_text": "A powerlifter in a meet singlet"}',
     30),
    ('Sprint Ghost',
     'Rare track speedster. Leaves the field behind.',
     'avatar', 'rare', 300, FALSE,
     '{"image_url": "/assets/cosmetics/avatars/sprint_ghost.png", "alt_text": "A sprinter mid-stride, motion blur"}',
     40),
    ('Peak Fettle Champion',
     'Legendary. Awarded to those who reach the top of the rankings.',
     'avatar', 'legendary', 750, FALSE,
     '{"image_url": "/assets/cosmetics/avatars/champion.png", "alt_text": "Gold-trimmed champion athlete on a podium"}',
     50),

-- ── Frames ─────────────────────────────────────────────────────────────────
    ('Simple Slate',
     'A clean dark border. Lets the avatar speak for itself.',
     'frame', 'common', 0, TRUE,
     '{"image_url": "/assets/cosmetics/frames/simple_slate.png", "color_hex": "#4A5568"}',
     0),
    ('Bronze Ring',
     'Warm bronze accent. Marks a dedicated competitor.',
     'frame', 'common', 100, FALSE,
     '{"image_url": "/assets/cosmetics/frames/bronze_ring.png", "color_hex": "#CD7F32"}',
     10),
    ('Silver Laurel',
     'A silver wreath border. Classical, earned.',
     'frame', 'rare', 300, FALSE,
     '{"image_url": "/assets/cosmetics/frames/silver_laurel.png", "color_hex": "#C0C0C0"}',
     20),
    ('Gold Circuit',
     'Rare electrified gold frame with circuit-board filigree.',
     'frame', 'rare', 300, FALSE,
     '{"image_url": "/assets/cosmetics/frames/gold_circuit.png", "color_hex": "#FFD700"}',
     30),
    ('Platinum Peak',
     'Legendary platinum mountain-peak frame. Only the elite.',
     'frame', 'legendary', 750, FALSE,
     '{"image_url": "/assets/cosmetics/frames/platinum_peak.png", "color_hex": "#E5E4E2"}',
     40),

-- ── Badges ─────────────────────────────────────────────────────────────────
    ('Consistent',
     'You show up. Every week, without fail.',
     'badge', 'common', 0, TRUE,
     '{"label": "Consistent", "icon": "calendar-check", "color_hex": "#718096"}',
     0),
    ('Early Bird',
     'Logs workouts before 7 AM more than anyone in your group.',
     'badge', 'common', 100, FALSE,
     '{"label": "Early Bird", "icon": "sunrise", "color_hex": "#F6AD55"}',
     10),
    ('Streak Master',
     'Maintained a group streak for 10+ consecutive weeks.',
     'badge', 'rare', 300, FALSE,
     '{"label": "Streak Master", "icon": "fire", "color_hex": "#E53E3E"}',
     20),
    ('Iron Will',
     'Hit your personal goal every week for a full month.',
     'badge', 'rare', 300, FALSE,
     '{"label": "Iron Will", "icon": "dumbbell", "color_hex": "#4A5568"}',
     30),
    ('Peak Performer',
     'Legendary. Top 1% of your cohort. Undeniable.',
     'badge', 'legendary', 750, FALSE,
     '{"label": "Peak Performer", "icon": "crown", "color_hex": "#D69E2E"}',
     40),

-- ── Themes ─────────────────────────────────────────────────────────────────
    ('Charcoal Dark',
     'The default dark mode. Sharp, focused, no distractions.',
     'theme', 'common', 0, TRUE,
     '{"primary": "#1A202C", "secondary": "#2D3748", "accent": "#63B3ED", "surface": "#4A5568", "on_primary": "#F7FAFC"}',
     0),
    ('Arctic White',
     'Clean light mode. Crisp as a morning run in January.',
     'theme', 'common', 100, FALSE,
     '{"primary": "#F7FAFC", "secondary": "#EDF2F7", "accent": "#3182CE", "surface": "#E2E8F0", "on_primary": "#1A202C"}',
     10),
    ('Midnight Blue',
     'Deep navy. Professional and calm.',
     'theme', 'rare', 300, FALSE,
     '{"primary": "#1A365D", "secondary": "#2A4365", "accent": "#90CDF4", "surface": "#2C5282", "on_primary": "#EBF8FF"}',
     20),
    ('Forest Green',
     'Earthy, grounded. For the athlete who trains outdoors.',
     'theme', 'rare', 300, FALSE,
     '{"primary": "#1C4532", "secondary": "#276749", "accent": "#9AE6B4", "surface": "#2F855A", "on_primary": "#F0FFF4"}',
     30),
    ('Crimson Beast',
     'Legendary blood-red. Power. Intensity. No apologies.',
     'theme', 'legendary', 750, FALSE,
     '{"primary": "#63171B", "secondary": "#822727", "accent": "#FEB2B2", "surface": "#9B2C2C", "on_primary": "#FFF5F5"}',
     40),
    ('Golden Hour',
     'Legendary warm amber gradient. The light of champions.',
     'theme', 'legendary', 750, FALSE,
     '{"primary": "#744210", "secondary": "#975A16", "accent": "#FAF089", "surface": "#B7791F", "on_primary": "#FFFFF0"}',
     50)

ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- SUMMARY
-- 3 tables, 3 indexes, 3 RLS policies.
-- 22 seed items: 6 avatars, 5 frames, 5 badges, 6 themes.
--   Default (free) items: 1 per category = 4 total.
--   Common (100 cr): 6 items.
--   Rare (300 cr): 7 items.
--   Legendary (750 cr): 5 items.
-- Application constants (prices, categories) also live in:
--   server/routes/cosmetics.js
-- ---------------------------------------------------------------------------
