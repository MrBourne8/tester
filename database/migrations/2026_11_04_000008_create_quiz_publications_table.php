<?php

declare(strict_types=1);

return new class {
    public function up(\PDO $pdo): void
    {
        $pdo->exec(
            'CREATE TABLE quiz_publications (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                quiz_id BIGINT UNSIGNED NOT NULL,
                teacher_id BIGINT UNSIGNED NOT NULL,
                session_id BIGINT UNSIGNED NOT NULL,
                public_slug VARCHAR(32) NOT NULL,
                status ENUM(\'active\', \'expired\', \'revoked\') NOT NULL DEFAULT \'active\',
                duration_hours INT UNSIGNED NOT NULL DEFAULT 24,
                expires_at DATETIME NOT NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                PRIMARY KEY (id),
                UNIQUE KEY quiz_publications_slug_unique (public_slug),
                KEY quiz_publications_quiz_status_index (quiz_id, status),
                KEY quiz_publications_teacher_index (teacher_id),
                CONSTRAINT quiz_publications_quiz_id_foreign
                    FOREIGN KEY (quiz_id) REFERENCES quizzes (id)
                    ON DELETE CASCADE,
                CONSTRAINT quiz_publications_teacher_id_foreign
                    FOREIGN KEY (teacher_id) REFERENCES users (id)
                    ON DELETE CASCADE,
                CONSTRAINT quiz_publications_session_id_foreign
                    FOREIGN KEY (session_id) REFERENCES sessions (id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
    }
};
