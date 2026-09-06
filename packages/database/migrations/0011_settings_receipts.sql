-- Migration number: 0011
-- Receipt OCR rate limits. Raw receipt images are never stored.
-- Household rename and location rename/deactivate use existing columns.

CREATE TABLE receipt_ai_rate_limits (
  user_id TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  PRIMARY KEY (user_id, window_start),
  FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE CASCADE
);
