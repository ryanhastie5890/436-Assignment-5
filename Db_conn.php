<?php
// File: Db_conn.php

class Db_conn {
    private $host = "localhost";      // change if needed
    private $db = "436db";            // your database name
    private $user = "436_mysql_user";           // your DB username
    private $pass = "123pwd456ABC+";               // your DB password
    private $charset = "utf8mb4";

    public $pdo;

    public function __construct() {
        $dsn = "mysql:host={$this->host};dbname={$this->db};charset={$this->charset}";
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];

        try {
            $this->pdo = new PDO($dsn, $this->user, $this->pass, $options);
        } catch (PDOException $e) {
            echo "DB Connection failed: " . $e->getMessage();
            exit;
        }
    }
}
