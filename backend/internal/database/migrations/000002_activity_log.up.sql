CREATE TABLE activity_logs (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action     TEXT        NOT NULL,  -- created | updated | deleted | status_changed | attachment_added
    diff       JSONB,                 -- { "before": {...}, "after": {...} }
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_task_id ON activity_logs(task_id);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);