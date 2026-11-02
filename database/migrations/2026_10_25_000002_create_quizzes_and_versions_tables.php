<?php

declare(strict_types=1);

return new class {
    public function up(\PDO $pdo): void
    {
        $pdo->exec(
            'CREATE TABLE quizzes (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                owner_id BIGINT UNSIGNED NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT NULL,
                schema_version VARCHAR(32) NOT NULL DEFAULT \'1.0\',
                current_version_id BIGINT UNSIGNED NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                PRIMARY KEY (id),
                KEY quizzes_owner_updated_index (owner_id, updated_at),
                CONSTRAINT quizzes_owner_id_foreign
                    FOREIGN KEY (owner_id) REFERENCES users (id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        $pdo->exec(
            'CREATE TABLE quiz_versions (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                quiz_id BIGINT UNSIGNED NOT NULL,
                version_number INT UNSIGNED NOT NULL,
                content_json JSON NOT NULL,
                content_hash CHAR(64) NOT NULL,
                created_at DATETIME NOT NULL,
                PRIMARY KEY (id),
                UNIQUE KEY quiz_versions_quiz_version_unique (quiz_id, version_number),
                KEY quiz_versions_content_hash_index (content_hash),
                CONSTRAINT quiz_versions_quiz_id_foreign
                    FOREIGN KEY (quiz_id) REFERENCES quizzes (id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        $pdo->exec(
            'ALTER TABLE quizzes
                ADD CONSTRAINT quizzes_current_version_id_foreign
                FOREIGN KEY (current_version_id) REFERENCES quiz_versions (id)
                ON DELETE SET NULL'
        );
    }
};
