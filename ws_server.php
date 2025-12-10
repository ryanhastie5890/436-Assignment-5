<?php
// File: ws_server.php (diagnostic version)
// Run: php -f ws_server.php
require_once __DIR__ . '/game_manager.php';

$port = 8080;
$serverSocket = createServerConnection($port);
socket_listen($serverSocket) or die ("Unable to start server, exiting!\n");
echo "WebSocket server running on port $port\n";

$listOfConnectedClients = [];
$screenToSocket = [];   // screenname -> socket resource
$socketToScreen = [];   // spl_object_id(socket) -> screenname

$gm = new GameManager();

do {
    $clientsWithData = waitForIncomingMessageFromClients($listOfConnectedClients, $serverSocket);

    // If server socket is readable -> accept new connection(s)
    if (in_array($serverSocket, $clientsWithData, true)) {
        $newSocket = socket_accept($serverSocket);
        if ($newSocket === false) {
            echo "socket_accept returned false\n";
        } else {
            // get remote address for logging
            $peerAddr = 'unknown';
            $peerPort = 0;
            @socket_getpeername($newSocket, $peerAddr, $peerPort);
            echo "Incoming TCP connection from {$peerAddr}:{$peerPort}\n";

            if (performHandshake($newSocket)) {
                $listOfConnectedClients[] = $newSocket;
                echo "New client connected (handshake OK). #clients: " . count($listOfConnectedClients) . "\n";
            } else {
                echo "Handshake failed for {$peerAddr}:{$peerPort} - disconnecting\n";
                disconnectClient($newSocket, $listOfConnectedClients, $screenToSocket, $socketToScreen);
            }
        }
    }

    // Process readable client sockets
    foreach ($clientsWithData as $clientSocket) {
        // skip serverSocket because we already handled accept above
        if ($clientSocket === $serverSocket) continue;

        $len = @socket_recv($clientSocket, $buffer, 8192, 0);
        if ($len === false || $len == 0) {
            // closed or error
            $peerAddr = 'unknown';
            $peerPort = 0;
            @socket_getpeername($clientSocket, $peerAddr, $peerPort);
            echo "Client {$peerAddr}:{$peerPort} closed connection or recv error. Removing.\n";
            disconnectClient($clientSocket, $listOfConnectedClients, $screenToSocket, $socketToScreen);
            continue;
        }

        $message = unmask($buffer);
        if ($message === "") {
            // empty application payload (ignore)
            continue;
        }

        // log message and peer
        $peerAddr = 'unknown';
        $peerPort = 0;
        @socket_getpeername($clientSocket, $peerAddr, $peerPort);
        echo "Received from {$peerAddr}:{$peerPort} -> $message\n";

        $obj = json_decode($message, true);
        if ($obj === null) {
            sendToClient($clientSocket, ['action' => 'ERROR', 'message' => 'Malformed JSON']);
            continue;
        }

        $action = $obj['action'] ?? null;

        if ($action === 'LOGIN') {
            $screenname = trim($obj['screenname'] ?? '');
            if ($screenname === '') {
                sendToClient($clientSocket, ['action' => 'screenname-unavailable']);
                continue;
            }
            $intKey = spl_object_id($clientSocket);
            $screenToSocket[$screenname] = $clientSocket;
            $socketToScreen[$intKey] = $screenname;

            $res = $gm->handleLogin($screenname);
            if ($res['action'] === 'screenname-unavailable') {
                sendToClient($clientSocket, ['action' => 'screenname-unavailable']);
            } else if ($res['action'] === 'LOGIN-OK') {
                sendToClient($clientSocket, ['action' => 'LOGIN-OK', 'list' => $res['list']]);
                broadcastToAll($listOfConnectedClients, ['action' => 'UPDATED-USER-LIST-AND-STATUS', 'list' => $res['list']]);
            } else {
                sendToClient($clientSocket, ['action' => 'ERROR', 'message' => ($res['message'] ?? 'Unknown')]);
            }
        }
        else if ($action === 'NEW-GAME') {
            $screenname = trim($obj['screenname'] ?? '');
            $choice = strtoupper(trim($obj['choice'] ?? ''));
            if ($screenname === '' || ($choice !== 'X' && $choice !== 'O')) {
                sendToClient($clientSocket, ['action' => 'ERROR', 'message' => 'Invalid NEW-GAME parameters']);
                continue;
            }
            $res = $gm->handleNewGame($screenname, $choice);
            if ($res['action'] === 'UPDATED-USER-LIST-AND-STATUS') {
                broadcastToAll($listOfConnectedClients, ['action' => 'UPDATED-USER-LIST-AND-STATUS', 'list' => $res['list']]);
            } else {
                sendToClient($clientSocket, $res);
            }
        }
        else if ($action === 'JOIN') {
            $from = trim($obj['from'] ?? '');
            $to = trim($obj['to'] ?? '');
            if ($from === '' || $to === '') {
                sendToClient($clientSocket, ['action' => 'ERROR', 'message' => 'Invalid JOIN parameters']);
                continue;
            }
            $res = $gm->handleJoin($from, $to);
            if ($res['action'] === 'ERROR') {
                sendToClient($clientSocket, $res);
                if (isset($res['list'])) broadcastToAll($listOfConnectedClients, ['action' => 'UPDATED-USER-LIST-AND-STATUS', 'list' => $res['list']]);
                continue;
            } else if ($res['action'] === 'PLAY') {
                $x = $res['x']; $o = $res['o']; $rowId = $res['rowId'];
                if (isset($screenToSocket[$x])) sendToClient($screenToSocket[$x], ['action' => 'PLAY', 'x' => $x, 'o' => $o, 'rowId' => $rowId]);
                if (isset($screenToSocket[$o])) sendToClient($screenToSocket[$o], ['action' => 'PLAY', 'x' => $x, 'o' => $o, 'rowId' => $rowId]);

                $inMem = $gm->getInMemoryGame($rowId);
                $startPayload = [
                    'action' => 'START-GAME',
                    'rowId' => $rowId,
                    'board' => $inMem ? $inMem['board'] : array_fill(0,9,""),
                    'turn' => $inMem ? $inMem['turn'] : 'X',
                    'x' => $x,
                    'o' => $o
                ];
                if (isset($screenToSocket[$x])) sendToClient($screenToSocket[$x], $startPayload);
                if (isset($screenToSocket[$o])) sendToClient($screenToSocket[$o], $startPayload);

                $list2 = $gm->getStatusListForBroadcast();
                broadcastToAll($listOfConnectedClients, ['action' => 'UPDATED-USER-LIST-AND-STATUS', 'list' => $list2]);
            }
        }
        else {
            sendToClient($clientSocket, ['action' => 'ERROR', 'message' => 'Unknown action']);
        }
    }

    // brief pause so this loop doesn't spin wildly
    usleep(1000);
} while (true);

// ========================= HELPERS ==============================

function createServerConnection($port, $host = 0) {
    $serverSocket = socket_create(AF_INET, SOCK_STREAM, SOL_TCP);
    socket_set_option($serverSocket, SOL_SOCKET, SO_REUSEADDR, 1);
    socket_bind($serverSocket, $host, $port);
    return $serverSocket;
}

function waitForIncomingMessageFromClients ($clients, $serverSocket) {
    $readList = $clients;
    $readList[] = $serverSocket;
    $writeList = $exceptionList = [];
    // socket_select will modify arrays in-place; use @ to suppress warnings when empty arrays
    @socket_select($readList, $writeList, $exceptionList, NULL);
    return $readList;
}

function disconnectClient ($clientSocket, &$listOfConnectedClients, &$screenToSocket, &$socketToScreen) {
    if (($clientKey = array_search($clientSocket, $listOfConnectedClients, true)) !== false) {
        unset($listOfConnectedClients[$clientKey]);
    }
    $intKey = @spl_object_id($clientSocket);
    if (isset($socketToScreen[$intKey])) {
        $sn = $socketToScreen[$intKey];
        unset($socketToScreen[$intKey]);
        if (isset($screenToSocket[$sn])) unset($screenToSocket[$sn]);
    }
    @socket_close($clientSocket);
    echo "Disconnected client. #clients: " . count($listOfConnectedClients) . "\n";
}

function performHandshake($clientSocket) {
    // read initial HTTP headers from client
    $len = @socket_recv($clientSocket, $headers, 4096, 0);
    if ($len === false || $len === 0) {
        // Log the raw value for debug
        echo "performHandshake: socket_recv returned len=" . var_export($len, true) . "\n";
        return false;
    }

    // show raw headers for debugging
    echo "Raw handshake headers:\n" . $headers . "\n--- END HEADERS ---\n";

    $headers = explode("\r\n", $headers);
    $headerArray = [];
    foreach ($headers as $header) {
        if (strpos($header, ': ') !== false) {
            list($k, $v) = explode(': ', $header, 2);
            $headerArray[trim($k)] = trim($v);
        }
    }

    if (!isset($headerArray['Sec-WebSocket-Key'])) {
        echo "performHandshake: Missing Sec-WebSocket-Key, refusing handshake\n";
        return false;
    }
    $secKey = $headerArray['Sec-WebSocket-Key'];
    $uuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    $secAccept = base64_encode(sha1($secKey . $uuid, true));

    $handshakeResponse =
        "HTTP/1.1 101 Switching Protocols\r\n" .
        "Upgrade: websocket\r\n" .
        "Connection: Upgrade\r\n" .
        "Sec-WebSocket-Accept: $secAccept\r\n\r\n";

    @socket_write($clientSocket, $handshakeResponse, strlen($handshakeResponse));
    echo "Handshake response sent (Sec-WebSocket-Accept: $secAccept)\n";
    return true;
}

function unmask($payload) {
    if (strlen($payload) == 0) return "";
    $length = ord($payload[1]) & 127;
    if ($length == 126) {
        $masks = substr($payload, 4, 4);
        $data = substr($payload, 8);
    } elseif ($length == 127) {
        $masks = substr($payload, 10, 4);
        $data = substr($payload, 14);
    } else {
        $masks = substr($payload, 2, 4);
        $data = substr($payload, 6);
    }
    $unmaskedtext = '';
    for ($i = 0; $i < strlen($data); ++$i) {
        $unmaskedtext .= $data[$i] ^ $masks[$i % 4];
    }
    return $unmaskedtext;
}

function mask($message) {
    $frame = [];
    $frame[0] = 129;
    $length = strlen($message);
    if ($length <= 125) {
        $frame[1] = $length;
    } elseif ($length <= 65535) {
        $frame[1] = 126;
        $frame[2] = ($length >> 8) & 255;
        $frame[3] = $length & 255;
    } else {
        $frame[1] = 127;
        for ($i=0;$i<8;$i++) {
            $frame[2+$i] = ($length >> (56-($i*8))) & 255;
        }
    }
    foreach (str_split($message) as $char) {
        $frame[] = ord($char);
    }
    return implode(array_map('chr', $frame));
}

function sendToClient($clientSocket, $assoc) {
    $msg = json_encode($assoc);
    $framed = mask($msg);
    @socket_write($clientSocket, $framed, strlen($framed));
}

function broadcastToAll($clients, $assoc) {
    $msg = json_encode($assoc);
    $framed = mask($msg);
    foreach ($clients as $client) {
        @socket_write($client, $framed, strlen($framed));
    }
}
