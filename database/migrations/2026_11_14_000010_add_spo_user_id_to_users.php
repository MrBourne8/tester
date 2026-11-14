<?php

declare(strict_types=1);

return new class {
    public function up(\PDO $pdo): void
    {
        $col = $pdo->query("SHOW COLUMNS FROM users LIKE 'spo_user_id'")->fetch(PDO::FETCH_ASSOC);
        if ($col) {
            return;
        }

        $pdo->exec(
            'ALTER TABLE users
             ADD spo_user_id INT UNSIGNED NULL DEFAULT NULL AFTER role,
             ADD UNIQUE KEY users_spo_user_id_unique (spo_user_id)'
        );
    }
};
