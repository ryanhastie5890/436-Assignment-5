/* client_ui.js — WebSocket version (replaces Socket.IO version)
   Works with the PHP ws_server.php provided above.
*/

var socket_ui = null;      // WebSocket object
var myName_ui = null;      // this client's chosen screen name
var myState_ui = 'idle';   // this client's current state

// Ensure WebSocket connection exists
function ensureSocket_ui() {
    if (socket_ui && socket_ui.readyState === WebSocket.OPEN) return;

    var host = window.location.hostname || 'localhost';
    var url = "ws://" + host + ":8080";
    socket_ui = new WebSocket(url);

    socket_ui.onopen = function() {
        console.log('Connected to PHP WebSocket server:', url);
    };

    socket_ui.onmessage = function(evt) {
        try {
            var data = JSON.parse(evt.data);
            handleServerMessage_ui(data);
        } catch (e) {
            console.error('Invalid JSON from server', evt.data);
        }
    };

    socket_ui.onclose = function() {
        console.log('Disconnected from server');
        socket_ui = null;
    };

    socket_ui.onerror = function(err) {
        console.error('WebSocket error', err);
    };
}

// send object to server as JSON
function sendToServer_ui(obj) {
    ensureSocket_ui();
    if (!socket_ui || socket_ui.readyState !== WebSocket.OPEN) {
        console.warn('Socket not open yet — message will be sent once connected');
        // Try to send after a short delay if socket becomes ready
        var tosend = JSON.stringify(obj);
        var tries = 0;
        var intv = setInterval(function() {
            tries++;
            if (socket_ui && socket_ui.readyState === WebSocket.OPEN) {
                socket_ui.send(tosend);
                clearInterval(intv);
            } else if (tries > 10) {
                clearInterval(intv);
                alert('Unable to send message — socket not open');
            }
        }, 150);
    } else {
        socket_ui.send(JSON.stringify(obj));
    }
}

// =========================== UI Event Wiring (same behavior as original) ==============================

// Handles login button click
document.getElementById('submitLogin').addEventListener('click', function() {
    var val = document.getElementById('screennameInput').value.trim();
    if (!val) {
        document.getElementById('loginMsg').innerText = 'Please enter a screen name.';
        return;
    }

    myName_ui = val;
    window.MY_SCREENNAME = myName_ui;

    ensureSocket_ui();
    sendToServer_ui({ action: 'LOGIN', screenname: val });
});

// Show and hide how-to overlay
document.getElementById('howToHeaderBtn').addEventListener('click', function() {
    document.getElementById('howToOverlay').classList.remove('hidden');
});
document.getElementById('closeHowTo').addEventListener('click', function() {
    document.getElementById('howToOverlay').classList.add('hidden');
});

// ========================= Server Message Handling ===================

/*
 * Receives messages from server and updates UI accordingly.
 * Handles actions: screenname-unavailable, LOGIN-OK, UPDATED-USER-LIST-AND-STATUS, PLAY, MOVE, MOVE-ACK, END-GAME, ERROR, START-GAME
 */
function handleServerMessage_ui(data) {
    if (!data || !data.action) return;
    var act = data.action;

    if (act === 'screenname-unavailable') {
        document.getElementById('loginMsg').innerText = 'Screen name unavailable. Try another.';
    } else if (act === 'LOGIN-OK') {
        document.getElementById('loginMsg').innerText = 'Login OK.';
        document.getElementById('loginSection').classList.add('hidden');
        document.getElementById('listsSection').classList.remove('hidden');
        updateListFromServer_ui(data.list || []);
    } else if (act === 'UPDATED-USER-LIST-AND-STATUS') {
        updateListFromServer_ui(data.list || []);
    } else if (act === 'PLAY') {
        document.getElementById('newGameArea').innerHTML = '';
        if (window.ClientGame && typeof window.ClientGame.startGame === 'function') {
            window.ClientGame.startGame(data);
        }
    } else if (act === 'START-GAME') {
        // START-GAME contains initial board, turn, x and o
        // For compatibility, call startGame (client_game.js will setup board)
        if (window.ClientGame && typeof window.ClientGame.startGame === 'function') {
            // include board + turn in data to allow client_game to render if needed
            window.ClientGame.startGame(data);
        }
    } else if (act === 'MOVE') {
        if (window.ClientGame && typeof window.ClientGame.onOpponentMove === 'function') {
            window.ClientGame.onOpponentMove(data);
        }
    } else if (act === 'MOVE-ACK') {
        if (window.ClientGame && typeof window.ClientGame.onMoveAck === 'function') {
            window.ClientGame.onMoveAck(data);
        }
    } else if (act === 'END-GAME') {
        if (window.ClientGame && typeof window.ClientGame.onEndGame === 'function') {
            window.ClientGame.onEndGame(data);
        }
    } else if (act === 'ERROR') {
        var msg = data.message || '';
        if (window.ClientGame && typeof window.ClientGame.onServerError === 'function') {
            window.ClientGame.onServerError(data);
        } else {
            alert('Server error: ' + msg);
        }
    }
}

// ====================== creating Player List =====================

// REPLACE the entire updateListFromServer_ui function with the following

// REPLACE the entire updateListFromServer_ui function with this improved version
function updateListFromServer_ui(list) {
    console.log("+++++++UI update received", list);
    console.log("updateListFromServer:", { list, myName_ui, myState_ui });

    var playersTable = document.getElementById('playersTable');
    var idleList = document.getElementById('idleList');

    // Build basic shell
    playersTable.innerHTML = ''
        + '<h3 style="text-align:center;margin-bottom:6px;">Playing / Waiting</h3>'
        + '<table class="playersTable" style="width:80%;border-collapse:collapse;margin:0.4em auto;border:1px solid #999;">'
        + '  <thead>'
        + '    <tr>'
        + '      <th style="text-align:center;padding:8px;border-right:1px solid #999;background:#fafafa;width:50%;">X</th>'
        + '      <th style="text-align:center;padding:8px;background:#fafafa;width:50%;">O</th>'
        + '    </tr>'
        + '  </thead>'
        + '  <tbody id="playersBody"></tbody>'
        + '</table>';

    idleList.innerHTML = ''
        + '<h3 style="text-align:center;margin-bottom:6px;">Idle Players</h3>'
        + '<table class="idleTable" style="width:50%;border-collapse:collapse;margin:0.4em auto;border:1px solid #999;">'
        + '  <thead>'
        + '    <tr><th style="text-align:center;padding:8px;background:#fafafa;">Names</th></tr>'
        + '  </thead>'
        + '  <tbody id="idleBody"></tbody>'
        + '</table>';

    var playersBody = document.getElementById('playersBody');
    var idleBody = document.getElementById('idleBody');

    // Normalize helper
    function norm(s) {
        if (!s && s !== "") return "";
        return String(s).trim().toLowerCase();
    }

    var myNameNorm = norm(myName_ui);

    // Quick lookup table by normalized name
    var map = {};
    list.forEach(it => {
        map[norm(it.screenname)] = it;
    });

    // Determine my state robustly
    var myState_ui_now = 'idle';
    if (myName_ui) {
        var me = list.find(it => norm(it.screenname) === myNameNorm);
        if (me) myState_ui_now = me.state || 'idle';
    }
    myState_ui = myState_ui_now; // keep global in sync

    var isIdle = (myState_ui === 'idle');
    var isPlaying = (typeof myState_ui === 'string' && myState_ui.startsWith('playing'));
    var isWaiting = (typeof myState_ui === 'string' && myState_ui.startsWith('waiting-'));
    var viewerSide = null;
    if (isWaiting) {
        var parts = myState_ui.split('-');
        if (parts.length > 1) viewerSide = parts[1]; // "X" or "O"
    }

    // Separate rows: we will collect playing and waiting rows using normalized matching
    var processed = {};
    var playingRows = [];
    var waitingRows = [];

    // Build playing rows (pair up opponents)
    list.forEach(entry => {
        var st = entry.state || 'idle';
        if (st.startsWith('playing') && !processed[norm(entry.screenname)]) {
            var opp = entry.opponent;
            var oppNorm = norm(opp);

            if (opp && map[oppNorm] && !processed[oppNorm]) {
                processed[norm(entry.screenname)] = true;
                processed[oppNorm] = true;

                // determine which is X and which is O based on entry.state
                var xName, oName;
                if (st.includes('playing-X')) {
                    xName = entry.screenname;
                    oName = opp;
                } else if (st.includes('playing-O')) {
                    oName = entry.screenname;
                    xName = opp;
                } else {
                    // fallback: use opponent fields if available
                    xName = entry.screenname;
                    oName = opp;
                }
                playingRows.push({ x: xName, o: oName });
            } else {
                // no matching opponent in list (defensive)
                processed[norm(entry.screenname)] = true;
                if (st.includes('playing-X')) playingRows.push({ x: entry.screenname, o: null });
                else playingRows.push({ x: null, o: entry.screenname });
            }
        }
    });

    // Build waiting rows
    list.forEach(entry => {
        var nameNorm = norm(entry.screenname);
        if (!processed[nameNorm]) {
            var st = entry.state || "idle";
            if (st.startsWith("waiting")) {
                processed[nameNorm] = true;
                if (st.includes("waiting-X")) waitingRows.push({ x: entry.screenname, o: null });
                else waitingRows.push({ x: null, o: entry.screenname });
            }
        }
    });

    // Render playing rows
    playingRows.forEach(r => {
        let tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid #ddd";

        let tdX = document.createElement("td");
        tdX.style.padding = "10px";
        tdX.style.textAlign = "center";
        tdX.style.borderRight = "1px solid #999";
        tdX.innerText = r.x || "";

        let tdO = document.createElement("td");
        tdO.style.padding = "10px";
        tdO.style.textAlign = "center";
        tdO.innerText = r.o || "";

        tr.appendChild(tdX);
        tr.appendChild(tdO);
        playersBody.appendChild(tr);
    });

    // Render waiting rows (with JOIN buttons only when allowed)
    waitingRows.forEach(r => {
        let tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid #ddd";

        let tdX = document.createElement("td");
        tdX.style.padding = "10px";
        tdX.style.textAlign = "center";
        tdX.style.borderRight = "1px solid #999";

        let tdO = document.createElement("td");
        tdO.style.padding = "10px";
        tdO.style.textAlign = "center";

        // waiting as X (opponent may join on O side)
        if (r.x) {
            tdX.innerText = r.x;

            // Normalized comparisons
            let waitingXNorm = norm(r.x);

            // allowJoin only if:
            // 1) current viewer is not the same player
            // 2) viewer is idle OR viewer is waiting as O (so they can join an X)
            let allowJoin = false;
            if (myName_ui) {
                if (waitingXNorm !== myNameNorm) {
                    if (isIdle || viewerSide === "O") allowJoin = true;
                }
            }

            // attach join button to O column (since you join on the O side)
            if (allowJoin) {
                let btn = document.createElement("button");
                btn.innerText = "JOIN";
                btn.addEventListener("click", () => {
                    sendToServer_ui({ action: 'JOIN', from: myName_ui, to: r.x });
                });
                tdO.appendChild(btn);
            }
        }
        // waiting as O (opponent may join on X side)
        else if (r.o) {
            tdO.innerText = r.o;

            let waitingONorm = norm(r.o);

            let allowJoin = false;
            if (myName_ui) {
                if (waitingONorm !== myNameNorm) {
                    if (isIdle || viewerSide === "X") allowJoin = true;
                }
            }

            // attach join button to X column (since you join on the X side)
            if (allowJoin) {
                let btn = document.createElement("button");
                btn.innerText = "JOIN";
                btn.addEventListener("click", () => {
                    sendToServer_ui({ action: 'JOIN', from: myName_ui, to: r.o });
                });
                tdX.appendChild(btn);
            }
        }

        tr.appendChild(tdX);
        tr.appendChild(tdO);
        playersBody.appendChild(tr);
    });

    // Render idle list
    list.forEach(entry => {
        if (!entry.state || entry.state === 'idle') {
            let tr = document.createElement("tr");
            tr.style.borderBottom = "1px solid #ddd";

            let td = document.createElement("td");
            td.style.padding = "10px";
            td.style.textAlign = "center";
            td.innerText = entry.screenname;

            tr.appendChild(td);
            idleBody.appendChild(tr);
        }
    });

    // NEW-GAME area: only show when logged-in and truly idle (not waiting/playing)
    var newGameArea = document.getElementById("newGameArea");
    newGameArea.innerHTML = "";

    if (myName_ui && myState_ui === 'idle') {
        let btn = document.createElement("button");
        btn.innerText = "NEW-GAME";
        btn.style.display = "block";
        btn.style.margin = "8px auto";
        btn.addEventListener("click", createNewGamePrompt_ui);
        newGameArea.appendChild(btn);
    }

    // debug info (optional)
    // console.log("myName:", myName_ui, "myState:", myState_ui, "viewerSide:", viewerSide);
}


// NEW-GAME prompt (overlay) — uses sendToServer_ui
function createNewGamePrompt_ui() {
    var overlay = document.getElementById('newGameOverlay');
    var content = document.getElementById('newGameOverlayContent');

    if (!overlay || !content) {
        var newGameArea = document.getElementById('newGameArea');
        newGameArea.innerHTML = '';
        var msg = document.createElement('div');
        msg.innerText = 'Choose side to wait as:';
        var xBtn = document.createElement('button'); xBtn.innerText = 'X';
        var oBtn = document.createElement('button'); oBtn.innerText = 'O';
        xBtn.addEventListener('click', function() {
            sendToServer_ui({ action: 'NEW-GAME', screenname: myName_ui, choice: 'X' });
            newGameArea.innerHTML = '<i>Waiting for opponent as X...</i>';
        });
        oBtn.addEventListener('click', function() {
            sendToServer_ui({ action: 'NEW-GAME', screenname: myName_ui, choice: 'O' });
            newGameArea.innerHTML = '<i>Waiting for opponent as O...</i>';
        });
        newGameArea.appendChild(msg); newGameArea.appendChild(xBtn); newGameArea.appendChild(oBtn);
        return;
    }

    content.innerHTML = '';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'closeBtn';
    closeBtn.innerText = '✕';
    closeBtn.addEventListener('click', function() {
        overlay.classList.add('hidden');
        content.innerHTML = '';
    });

    var msg = document.createElement('div'); msg.style.marginBottom = '10px';
    msg.innerText = 'Choose side to wait as:';

    var xBtn = document.createElement('button'); xBtn.style.marginRight = '10px'; xBtn.innerText = 'X';
    xBtn.addEventListener('click', function() {
        sendToServer_ui({ action: 'NEW-GAME', screenname: myName_ui, choice: 'X' });
        overlay.classList.add('hidden');
        content.innerHTML = '';
    });

    var oBtn = document.createElement('button'); oBtn.innerText = 'O';
    oBtn.addEventListener('click', function() {
        sendToServer_ui({ action: 'NEW-GAME', screenname: myName_ui, choice: 'O' });
        overlay.classList.add('hidden');
        content.innerHTML = '';
    });

    content.appendChild(closeBtn);
    content.appendChild(msg);
    content.appendChild(xBtn);
    content.appendChild(oBtn);

    overlay.classList.remove('hidden');
}

// Public API for client_game.js to call
window.ClientUI = {
    getMyName: function() { return myName_ui; },
    sendMove: function(screenname, cell) {
        sendToServer_ui({ action: 'MOVE', screenname: screenname, cell: cell });
    },
    sendEndGame: function(rowId, result, winner, winnerName) {
        sendToServer_ui({ action: 'END-GAME', rowId: rowId, result: result, winner: winner, winnerName: winnerName });
    }
};
