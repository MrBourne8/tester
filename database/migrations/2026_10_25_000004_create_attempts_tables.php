<?php

declare(strict_types=1);

return new class {
    public function up(\PDO $pdo): void
    {
        $pdo->exec(
            'CREATE TABLE attempts (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                quiz_version_id BIGINT UNSIGNED NOT NULL,
                session_id BIGINT UNSIGNED NULL,
                participant_id BIGINT UNSIGNED NULL,
                attempt_token_hash CHAR(64) NULL,
                status ENUM(\'in_progress\', \'submitted\', \'expired\', \'void\')
                    NOT NULL DEFAULT \'in_progress\',
                started_at DATETIME NOT NULL,
                submitted_at DATETIME NULL,
                score DECIMAL(10, 2) NULL,
                max_score DECIMAL(10, 2) NULL,
                percentage DECIMAL(5, 2) NULL,
                result_payload JSON NULL,
                created_at DATETIME NOT NULL,
                PRIMARY KEY (id),
                KEY attempts_session_status_index (session_id, status),
                KEY attempts_quiz_version_id_index (quiz_version_id),
                KEY attempts_participant_id_index (participant_id),
                CONSTRAINT attempts_quiz_version_id_foreign
                    FOREIGN KEY (quiz_version_id) REFERENCES quiz_versions (id),
                CONSTRAINT attempts_session_id_foreign
                    FOREIGN KEY (session_id) REFERENCES sessions (id)
                    ON DELETE SET NULL,
                CONSTRAINT attempts_participant_id_foreign
                    FOREIGN KEY (participant_id) REFERENCES participants (id)
                    ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        $pdo->exec(
            'CREATE TABLE attempt_answers (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                attempt_id BIGINT UNSIGNED NOT NULL,
                question_id VARCHAR(64) NOT NULL,
                answer_json JSON NOT NULL,
                awarded_score DECIMAL(10, 2) NULL,
                is_correct TINYINT(1) NULL,
                answered_at DATETIME NOT NULL,
                PRIMARY KEY (id),
                UNIQUE KEY attempt_answers_attempt_question_unique (attempt_id, question_id),
                CONSTRAINT attempt_answers_attempt_id_foreign
                    FOREIGN KEY (attempt_id) REFERENCES attempts (id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        $pdo->exec(
            'CREATE TABLE imported_results (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                teacher_id BIGINT UNSIGNED NOT NULL,
                source_file_hash CHAR(64) NOT NULL,
                attempt_id BIGINT UNSIGNED NOT NULL,
                imported_at DATETIME NOT NULL,
                PRIMARY KEY (id),
                UNIQUE KEY imported_results_teacher_hash_unique (teacher_id, source_file_hash),
                CONSTRAINT imported_results_teacher_id_foreign
                    FOREIGN KEY (teacher_id) REFERENCES users (id)
                    ON DELETE CASCADE,
                CONSTRAINT imported_results_attempt_id_foreign
                    FOREIGN KEY (attempt_id) REFERENCES attempts (id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
    }
};
