ALTER TABLE moderation_audit_log
    ALTER COLUMN admin_id DROP NOT NULL,
    DROP CONSTRAINT moderation_audit_log_admin_id_fkey,
    ADD CONSTRAINT moderation_audit_log_admin_id_fkey
        FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL;
