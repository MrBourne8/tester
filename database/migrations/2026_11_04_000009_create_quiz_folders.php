<?php

declare(strict_types=1);

return new class {
    public function up(\PDO $pdo): void
    {
        $pdo->exec(
            'CREATE TABLE quiz_folders (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                owner_id BIGINT UNSIGNED NOT NULL,
                name VARCHAR(120) NOT NULL,
                sort_order INT NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                PRIMARY KEY (id),
                KEY quiz_folders_owner_sort_index (owner_id, sort_order, id),
                CONSTRAINT quiz_folders_owner_id_foreign
                    FOREIGN KEY (owner_id) REFERENCES users (id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        $pdo->exec(
            'ALTER TABLE quizzes
                ADD COLUMN folder_id BIGINT UNSIGNED NULL AFTER owner_id,
                ADD KEY quizzes_folder_id_index (folder_id),
                ADD CONSTRAINT quizzes_folder_id_foreign
                    FOREIGN KEY (folder_id) REFERENCES quiz_folders (id)
                    ON DELETE SET NULL'
        );
    }
};
