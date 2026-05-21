-- Migration: 20260516_theme_preference.sql
-- Phase E — E-002: Theme Switcher
--
-- Adds theme_preference column to users table so the selected theme
-- persists across devices and survives an app reinstall.
-- The mobile app reads this at login and writes it on theme change
-- via PATCH /user/profile { theme_preference }.
--
-- Valid values match the ThemeName union type in mobile/src/theme/types.ts:
--   'deepOcean' | 'ember' | 'forest' | 'midnight' | 'monochrome'

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS theme_preference TEXT
    DEFAULT 'deepOcean'
    CHECK (theme_preference IN ('deepOcean', 'ember', 'forest', 'midnight', 'monochrome'));

COMMENT ON COLUMN users.theme_preference IS
  'User-selected app theme. Default: deepOcean (dark navy + turquoise). '
  'Persisted via PATCH /user/profile and loaded at auth login. '
  'Valid values: deepOcean | ember | forest | midnight | monochrome (Phase E, E-002).';
