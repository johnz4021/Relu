CREATE TABLE feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,       -- 'help', 'algorithm_request', 'session_rating'
  name TEXT,
  email TEXT,
  message TEXT,
  rating INTEGER,               -- 1-5, only for session_rating
  meta JSONB,                   -- mode, algorithm, etc.
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON feedback FOR ALL USING (true);
