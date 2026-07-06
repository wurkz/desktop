-- Job timing: capture when a mechanic starts work and when it's marked done, so a future
-- report can measure how long jobs take. Nullable; stamped by the start/done transitions.
ALTER TABLE orders ADD COLUMN started_at INTEGER;   -- set when the job goes approved → in_progress
ALTER TABLE orders ADD COLUMN completed_at INTEGER; -- set when marked done
