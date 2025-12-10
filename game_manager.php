<?php
// File: game_manager.php
// Part 2 PHP game manager: LOGIN, NEW-GAME, JOIN, status list, initial board
require_once __DIR__ . '/PdoMethods.php';

class GameManager {
    private $pdo;
    private $games = []; // in-memory games keyed by players.id

    public function __construct() {
        $this->pdo = new PdoMethods();
    }

    // DB helpers (use your PdoMethods)
    private function getLoggedIn() {
        $sql = "SELECT screenname FROM logged_in ORDER BY screenname";
        $res = $this->pdo->selectNotBinded($sql);
        if ($res === 'error') return false;
        return $res;
    }

    private function insertLoggedIn($name) {
        $sql = "INSERT INTO logged_in (screenname, datetime) VALUES (:name, NOW())";
        $bindings = [[":name", $name, "str"]];
        return $this->pdo->otherBinded($sql, $bindings) === 'noerror';
    }

    private function removeLoggedIn($name) {
        $sql = "DELETE FROM logged_in WHERE screenname = :name";
        $bindings = [[":name", $name, "str"]];
        return $this->pdo->otherBinded($sql, $bindings) === 'noerror';
    }

    private function getPlayers() {
        $sql = "SELECT * FROM players";
        $res = $this->pdo->selectNotBinded($sql);
        if ($res === 'error') return false;
        return $res;
    }

    private function insertPlayer($x, $o) {
        $sql = "INSERT INTO players (x_player, o_player) VALUES (:x, :o)";
        $bindings = [[":x", $x, "str"], [":o", $o, "str"]];
        return $this->pdo->otherBinded($sql, $bindings) === 'noerror';
    }

    private function updatePlayerById($id, $x, $o) {
        $sql = "UPDATE players SET x_player = :x, o_player = :o WHERE id = :id";
        $bindings = [[":x", $x, "str"], [":o", $o, "str"], [":id", $id, "int"]];
        return $this->pdo->otherBinded($sql, $bindings) === 'noerror';
    }

    private function deletePlayerById($id) {
        $sql = "DELETE FROM players WHERE id = :id";
        $bindings = [[":id", $id, "int"]];
        return $this->pdo->otherBinded($sql, $bindings) === 'noerror';
    }

// Find a player row by screenname (fixes PDO duplicate parameter issue)
private function findPlayerRowByName($name) {
    $sql = "SELECT * FROM players WHERE x_player = :x_name OR o_player = :o_name";
    $bindings = [
        [":x_name", $name, "str"],
        [":o_name", $name, "str"]
    ];
    $res = $this->pdo->selectBinded($sql, $bindings);
    if ($res === 'error') return false;
    return $res;
}

// Find a waiting row for JOIN (fixes PDO duplicate parameter issue)
private function findWaitingRowByOpponent($name) {
    $sql = "SELECT * FROM players 
            WHERE (x_player = :x_name OR o_player = :o_name) 
              AND ((x_player IS NULL) XOR (o_player IS NULL))";
    $bindings = [
        [":x_name", $name, "str"],
        [":o_name", $name, "str"]
    ];
    $res = $this->pdo->selectBinded($sql, $bindings);
    if ($res === 'error') return false;
    return $res;
}


    // Build status list: array of {screenname, state, opponent}
    public function buildStatusList() {
        $logged = $this->getLoggedIn();
        if ($logged === false) return false;
        $players = $this->getPlayers();
        if ($players === false) return false;

        $statusMap = [];
        foreach ($logged as $r) {
            $statusMap[$r['screenname']] = ['state' => 'idle', 'opponent' => null];
        }

        foreach ($players as $row) {
            $x = $row['x_player'];
            $o = $row['o_player'];

            if ($x && $o) {
                if (isset($statusMap[$x])) $statusMap[$x] = ['state' => 'playing-X', 'opponent' => $o];
                if (isset($statusMap[$o])) $statusMap[$o] = ['state' => 'playing-O', 'opponent' => $x];
            } else if ($x && !$o) {
                if (isset($statusMap[$x])) $statusMap[$x] = ['state' => 'waiting-X', 'opponent' => null];
            } else if ($o && !$x) {
                if (isset($statusMap[$o])) $statusMap[$o] = ['state' => 'waiting-O', 'opponent' => null];
            }
        }

        $list = [];
        foreach ($statusMap as $name => $v) {
            $list[] = ['screenname' => $name, 'state' => $v['state'], 'opponent' => $v['opponent']];
        }
        return $list;
    }

    // LOGIN
    public function handleLogin($screenname) {
        $logged = $this->getLoggedIn();
        if ($logged === false) return ['action' => 'ERROR', 'message' => 'DB error'];
        foreach ($logged as $r) {
            if ($r['screenname'] === $screenname) return ['action' => 'screenname-unavailable'];
        }

        if (!$this->insertLoggedIn($screenname)) return ['action' => 'ERROR', 'message' => 'DB insert failed'];
        $list = $this->buildStatusList();
        if ($list === false) return ['action' => 'ERROR', 'message' => 'DB error'];
        return ['action' => 'LOGIN-OK', 'list' => $list];
    }

    // NEW-GAME (waiting row)
    public function handleNewGame($screenname, $choice) {
        $logged = $this->getLoggedIn();
        if ($logged === false) return ['action' => 'ERROR', 'message' => 'DB error 1'];
        $found = false;
        foreach ($logged as $r) if ($r['screenname'] === $screenname) $found = true;
        if (!$found) return ['action' => 'ERROR', 'message' => 'Not logged in'];

        $prow = $this->findPlayerRowByName($screenname);
        if ($prow === false) return ['action' => 'ERROR', 'message' => 'DB error 2'];
        if (count($prow) > 0) return ['action' => 'ERROR', 'message' => 'Already in players table'];

        if ($choice === 'X') $ok = $this->insertPlayer($screenname, null);
        else $ok = $this->insertPlayer(null, $screenname);

        if (!$ok) return ['action' => 'ERROR', 'message' => 'DB insert failed'];
        $list = $this->buildStatusList();
        if ($list === false) return ['action' => 'ERROR', 'message' => 'DB error 3'];
        return ['action' => 'UPDATED-USER-LIST-AND-STATUS', 'list' => $list];
    }

    // JOIN
    public function handleJoin($from, $to) {
        $fromRows = $this->findPlayerRowByName($from);
        if ($fromRows === false) return ['action' => 'ERROR', 'message' => 'DB error'];

        $alreadyPlaying = false;
        if (count($fromRows) > 0) {
            foreach ($fromRows as $fr) {
                if ($fr['x_player'] && $fr['o_player']) { $alreadyPlaying = true; break; }
            }
        }
        if ($alreadyPlaying) {
            $list = $this->buildStatusList();
            return ['action' => 'ERROR', 'message' => 'You are already waiting or playing', 'list' => $list];
        }

        $rowsFind = $this->findWaitingRowByOpponent($to);
        if ($rowsFind === false) return ['action' => 'ERROR', 'message' => 'DB error'];
        if (!$rowsFind || count($rowsFind) === 0) {
            $list = $this->buildStatusList();
            return ['action' => 'ERROR', 'message' => 'Opponent not waiting', 'list' => $list];
        }

        $waitingRow = $rowsFind[0];
        $xName = $waitingRow['x_player'];
        $oName = $waitingRow['o_player'];

        if (!$xName && $oName) $xName = $from;
        else if ($xName && !$oName) $oName = $from;
        else return ['action' => 'ERROR', 'message' => 'Invalid waiting row'];

        $updOk = $this->updatePlayerById($waitingRow['id'], $xName, $oName);
        if (!$updOk) return ['action' => 'ERROR', 'message' => 'DB update failed'];

        $allPlayers = $this->getPlayers();
        if ($allPlayers !== false) {
            foreach ($allPlayers as $pRow) {
                if ($pRow['id'] != $waitingRow['id'] &&
                    ($pRow['x_player'] === $from || $pRow['o_player'] === $from || $pRow['x_player'] === $to || $pRow['o_player'] === $to)) {
                    $this->deletePlayerById($pRow['id']);
                }
            }
        }

        // create in-memory board (initialized to empty strings)
        if ($xName && $oName) {
            $this->games[$waitingRow['id']] = [
                'board' => array_fill(0,9, ""),
                'turn' => 'X',
                'x' => $xName,
                'o' => $oName
            ];
        }

        return ['action' => 'PLAY', 'rowId' => (int)$waitingRow['id'], 'x' => $xName, 'o' => $oName];
    }

    public function getInMemoryGame($rowId) {
        if (isset($this->games[$rowId])) return $this->games[$rowId];
        return null;
    }

    public function getStatusListForBroadcast() {
        $list = $this->buildStatusList();
        if ($list === false) return [];
        return $list;
    }
}
