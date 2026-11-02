<?php

declare(strict_types=1);

return new class {
    public function up(\PDO $pdo): void
    {
        $pdo->exec(
            'CREATE TABLE sessions (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                quiz_version_id BIGINT UNSIGNED NOT NULL,
                teacher_id BIGINT UNSIGNED NOT NULL,
                session_code VARCHAR(16) NOT NULL,
                status ENUM(\'draft\', \'open\', \'running\', \'paused\', \'finished\', \'closed\')
                    NOT NULL DEFAULT \'draft\',
                settings_json JSON NULL,
                starts_at DATETIME NULL,
                ends_at DATETIME NULL,
                created_at DATETIME NOT NULL,
                PRIMARY KEY (id),
                UNIQUE KEY sessions_session_code_unique (session_code),
                KEY sessions_teacher_created_index (teacher_id, created_at),
                KEY sessions_status_index (status),
                CONSTRAINT sessions_quiz_version_id_foreign
                    FOREIGN KEY (quiz_version_id) REFERENCES quiz_versions (id),
                CONSTRAINT sessions_teacher_id_foreign
                    FOREIGN KEY (teacher_id) REFERENCES users (id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        $pdo->exec(
            'CREATE TABLE participants (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                session_id BIGINT UNSIGNED NOT NULL,
                display_name VARCHAR(255) NOT NULL,
                external_identifier VARCHAR(255) NULL,
                joined_at DATETIME NOT NULL,
                status ENUM(\'joined\', \'in_progress\', \'submitted\', \'disconnected\')
                    NOT NULL DEFAULT \'joined\',
                PRIMARY KEY (id),
                KEY participants_session_status_index (session_id, status),
                CONSTRAINT participants_session_id_foreign
                    FOREIGN KEY (session_id) REFERENCES sessions (id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
    }
};
