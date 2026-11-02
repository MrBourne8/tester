<?php

declare(strict_types=1);

return new class {
    public function up(\PDO $pdo): void
    {
        $pdo->exec(
            'ALTER TABLE participants
                ADD COLUMN token_hash CHAR(64) NULL AFTER status,
                ADD COLUMN last_seen_at DATETIME NULL AFTER token_hash,
                ADD KEY participants_token_hash_index (token_hash)'
        );

        $pdo->exec(
            'ALTER TABLE attempts
                ADD COLUMN attempt_meta JSON NULL AFTER attempt_token_hash'
        );
    }
};
