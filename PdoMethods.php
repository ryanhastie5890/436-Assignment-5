<?php
// File: PdoMethods.php
require_once __DIR__ . '/Db_conn.php';

class PdoMethods {
    private $conn;

    public function __construct() {
        $db = new Db_conn();
        $this->conn = $db->pdo;
    }

    // SELECT with bound parameters
    // $bindings = [ [":param", value, "str/int"], ... ]
    public function selectBinded($sql, $bindings) {
        try {
            $stmt = $this->conn->prepare($sql);
            foreach ($bindings as $b) {
                $param = $b[0];
                $val = $b[1];
                $type = $b[2];
                $pdoType = $type === "int" ? PDO::PARAM_INT : PDO::PARAM_STR;
                $stmt->bindValue($param, $val, $pdoType);
            }
            $stmt->execute();
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            error_log("selectBinded PDOException: " . $e->getMessage() . "\nSQL: $sql");
            return "error";
        }
    }    

    // SELECT without bound parameters
    public function selectNotBinded($sql) {
        try {
            $stmt = $this->conn->query($sql);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            return "error";
        }
    }

    // INSERT/UPDATE/DELETE with bound parameters
    public function otherBinded($sql, $bindings) {
        try {
            $stmt = $this->conn->prepare($sql);
            foreach ($bindings as $b) {
                $param = $b[0];
                $val = $b[1];
                $type = $b[2];
                $pdoType = $type === "int" ? PDO::PARAM_INT : PDO::PARAM_STR;
                $stmt->bindValue($param, $val, $pdoType);
            }
            $stmt->execute();
            return "noerror";
        } catch (PDOException $e) {
            return "error";
        }
    }

    // INSERT/UPDATE/DELETE without bound parameters
    public function otherNotBinded($sql) {
        try {
            $this->conn->exec($sql);
            return "noerror";
        } catch (PDOException $e) {
            return "error";
        }
    }
}
