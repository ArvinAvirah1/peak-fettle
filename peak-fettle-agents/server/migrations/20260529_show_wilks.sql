-- TICKET-066: per-user preference to show Wilks score in rankings
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_wilks BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN users.show_wilks IS 'User opted in to seeing their Wilks2 score in the rankings tab.';
