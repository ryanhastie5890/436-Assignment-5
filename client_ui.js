/*
=====================================================================
File: client_ui.js
Author:antonio, ishaq
Date: November 2025
Explanation:
- This file manages all client-side UI logic and socket interactions like:
- Handling login and screen name validation
- Rendeing player lists: idle, waiting, playing
- Providinh JOIN buttons for idle clients and for waiting clients (opposite side)
- new game creation (choosing X/O)
- Receives server messages and forwards them to ClientGame
- Sends moves and end-game actions to server
- The goal is to keep concerns as separate as possible.
Basically: handles everything the player sees and interacts with.
=====================================================================
*/

var socket_ui = null;      // storing the socket.io connection
var myName_ui = null;      // storing this client's chosen screen name
var myState_ui = 'idle';   // storing this client's current state, updated from server

/*
 * Ensures a socket connection exists, creating it if needed.
 */
function ensureSocket_ui() {
    if (socket_ui) return; // socket already created

    socket_ui = io(); // connecting to socket.io on the same origin

    socket_ui.on('connect', function() {
        console.log('connected to socket server', socket_ui.id);
    });

    socket_ui.on('game-msg', function(data) {
        handleServerMessage_ui(data); // dispatch incoming server messages
    });
}

/*
 * Sends a JSON object to the server via socket.io.
 * Calls ensureSocket_ui to guarantee the connection exists.
 */
function sendToServer_ui(obj) {
    ensureSocket_ui();
    socket_ui.emit('game-msg', obj);
}

// =========================== UI Event Wiring ==============================

// Handles login button click
document.getElementById('submitLogin').addEventListener('click', function() {
    var val = document.getElementById('screennameInput').value.trim();
    if (!val) {
        document.getElementById('loginMsg').innerText = 'Please enter a screen name.';
        return;
    }

    myName_ui = val;                // storing client screen name
    window.MY_SCREENNAME = myName_ui; // making globally accessible for other scripts

    ensureSocket_ui();              // ensure socket exists
    sendToServer_ui({ action: 'LOGIN', screenname: val }); // sending LOGIN message
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
 * Handles actions:
 * - screenname-unavailable
 * - LOGIN-OK
 * - UPDATED-USER-LIST-AND-STATUS
 * - PLAY
 * - MOVE / MOVE-ACK
 * - END-GAME
 * - ERROR
 */
function handleServerMessage_ui(data) {
    if (!data || !data.action) return; // ignore malformed messages
    var act = data.action;

    if (act === 'screenname-unavailable') {
        document.getElementById('loginMsg').innerText = 'Screen name unavailable. Try another.';
    } else if (act === 'LOGIN-OK') {
        // login succeeded, hide login, show lists, update UI
        document.getElementById('loginMsg').innerText = 'Login OK.';
        document.getElementById('loginSection').classList.add('hidden');
        document.getElementById('listsSection').classList.remove('hidden');
        updateListFromServer_ui(data.list || []);
    } else if (act === 'UPDATED-USER-LIST-AND-STATUS') {
        // update player list and states in UI
        updateListFromServer_ui(data.list || []);
    } else if (act === 'PLAY') {
        // start a game: clear new-game area and call ClientGame.startGame
        document.getElementById('newGameArea').innerHTML = '';
        if (window.ClientGame && typeof window.ClientGame.startGame === 'function') {
            window.ClientGame.startGame(data);
        }
    } else if (act === 'MOVE') {
        // handle opponent move
        if (window.ClientGame && typeof window.ClientGame.onOpponentMove === 'function') {
            window.ClientGame.onOpponentMove(data);
        }
    } else if (act === 'MOVE-ACK') {
        // acknowledge own move
        if (window.ClientGame && typeof window.ClientGame.onMoveAck === 'function') {
            window.ClientGame.onMoveAck(data);
        }
    } else if (act === 'END-GAME') {
        // handle end of game (win/draw)
        if (window.ClientGame && typeof window.ClientGame.onEndGame === 'function') {
            window.ClientGame.onEndGame(data);
        }
    } else if (act === 'ERROR') {
        // forward errors to ClientGame or show alert if no handler
        var msg = data.message || '';
        if (window.ClientGame && typeof window.ClientGame.onServerError === 'function') {
            window.ClientGame.onServerError(data);
        } else {
            alert('Server error: ' + msg);
        }
    }
}

// ======================creating Player List =====================

/*
 * Updates the UI with players who are idle, waiting, or playing.
 * 1. creates playing pairs and waiting users into the single Players table
 * 2. creates idle users in the idle list
 */
function updateListFromServer_ui(list) {
    var playersTable = document.getElementById('playersTable');
    var idleList = document.getElementById('idleList');

    // Build Players table
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

    // Build Idle table
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

    var map = {}; // mapping screenname -> entry
    list.forEach(function(it) { map[it.screenname] = it; });

    // determine my current state from server
    myState_ui = 'idle';
    if (myName_ui) {
        for (var i = 0; i < list.length; i++) {
            if (list[i].screenname === myName_ui) {
                myState_ui = list[i].state;
                break;
            }
        }
    }

    // viewerSide is null if idle, otherwise 'X' or 'O' when waiting
    var viewerSide = null;
    if (myState_ui && myState_ui.indexOf('waiting-') === 0) {
        viewerSide = myState_ui.charAt(myState_ui.length - 1); // last char X or O
    }

    var processed = {}; // track rendered screen names to avoid duplicates

    var playingRows = []; // rows where both x and o present
    var waitingRows = []; // rows where only x or only o present
    var idleNames = [];

    // handling players table first
    //collect playing pairs and waiting rows
    list.forEach(function(entry) {
        if (processed[entry.screenname]) return;

        var st = entry.state || 'idle';

        // Playing entries
        if (st.indexOf('playing') === 0) {
            var opp = entry.opponent;
            if (opp && map[opp]) {
                processed[entry.screenname] = true;
                processed[opp] = true;

                var xName, oName;
                if (st.indexOf('playing-X') === 0) {
                    xName = entry.screenname;
                    oName = opp;
                } else {
                    oName = entry.screenname;
                    xName = opp;
                }
                playingRows.push({ x: xName, o: oName });
            } else {
                //  opponent not present in map
                processed[entry.screenname] = true;
                if (st.indexOf('playing-X') === 0) playingRows.push({ x: entry.screenname, o: null });
                else playingRows.push({ x: null, o: entry.screenname });
            }
            return;
        }

        // Waiting entries = putting waiting player into chosen column, other column empty
        if (st.indexOf('waiting') === 0) {
            processed[entry.screenname] = true;
            if (st.indexOf('waiting-X') === 0) {
                waitingRows.push({ x: entry.screenname, o: null });
            } else {
                waitingRows.push({ x: null, o: entry.screenname });
            }
            return;
        }
    });

    //handling idle table
    // collect idle names
    list.forEach(function(entry) {
        if (processed[entry.screenname]) return;

        if (!entry.state || entry.state === 'idle') {
            idleNames.push(entry.screenname);
            processed[entry.screenname] = true;
        } else {
            // back for any remaining entries
            processed[entry.screenname] = true;
            if (entry.state.indexOf('playing-X') === 0) playingRows.push({ x: entry.screenname, o: null });
            else if (entry.state.indexOf('playing-O') === 0) playingRows.push({ x: null, o: entry.screenname });
            else if (entry.state.indexOf('waiting-X') === 0) waitingRows.push({ x: entry.screenname, o: null });
            else if (entry.state.indexOf('waiting-O') === 0) waitingRows.push({ x: null, o: entry.screenname });
        }
    });

    // create playing rowsonly names
    playingRows.forEach(function(r) {
        var tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #ddd';

        var tdLeft = document.createElement('td');   // X column (left)
        tdLeft.style.padding = '10px';
        tdLeft.style.borderRight = '1px solid #999';
        tdLeft.style.textAlign = 'center';
        tdLeft.innerText = r.x || '';

        var tdRight = document.createElement('td');  // O column (right)
        tdRight.style.padding = '10px';
        tdRight.style.textAlign = 'center';
        tdRight.innerText = r.o || '';

        tr.appendChild(tdLeft);
        tr.appendChild(tdRight);
        playersBody.appendChild(tr);
    });

    /* creating waiting rows. 
     * JOIN button is shown to all other idle pplayers also waiting players with opposite choose
     */
    waitingRows.forEach(function(r) {
        var tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #ddd';

        var tdLeft = document.createElement('td');   // X column 
        tdLeft.style.padding = '10px';
        tdLeft.style.borderRight = '1px solid #999';
        tdLeft.style.textAlign = 'center';

        var tdRight = document.createElement('td');  // O column 
        tdRight.style.padding = '10px';
        tdRight.style.textAlign = 'center';

        if (r.x) {
            // waiting as x
            tdLeft.innerText = r.x;
            // plaer may join on O side if viewer is idle OR viewer is waiting as O
            var canJoin = false;
            if (r.x !== myName_ui) {
                if (viewerSide === null) canJoin = true;
                else if (viewerSide === 'O') canJoin = true; // viewer waiting as O can join X
            }
            if (canJoin) {
                var joinBtn = document.createElement('button');
                joinBtn.innerText = 'JOIN';
                joinBtn.style.display = 'inline-block';
                joinBtn.style.margin = '0 auto';
                joinBtn.addEventListener('click', function() {
                    sendToServer_ui({ action: 'JOIN', from: myName_ui, to: r.x });
                });
                tdRight.appendChild(joinBtn);
            } else {
                tdRight.innerText = '';
            }
        } else if (r.o) {
            // waiting as O
            tdRight.innerText = r.o;
            // viewer may join on X side if viewer is idle OR viewer is waiting as X
            var canJoin2 = false;
            if (r.o !== myName_ui) {
                if (viewerSide === null) canJoin2 = true;
                else if (viewerSide === 'X') canJoin2 = true; // viewer waiting as X can join O
            }
            if (canJoin2) {
                var joinBtn2 = document.createElement('button');
                joinBtn2.innerText = 'JOIN';
                joinBtn2.style.display = 'inline-block';
                joinBtn2.style.margin = '0 auto';
                joinBtn2.addEventListener('click', function() {
                    sendToServer_ui({ action: 'JOIN', from: myName_ui, to: r.o });
                });
                tdLeft.appendChild(joinBtn2);
            } else {
                tdLeft.innerText = '';
            }
        }

        tr.appendChild(tdLeft);
        tr.appendChild(tdRight);
        playersBody.appendChild(tr);
    });

    // create idle list as table rows
    idleNames.forEach(function(name) {
        var tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #ddd';
        var td = document.createElement('td');
        td.style.padding = '10px';
        td.style.textAlign = 'center';
        td.innerText = name;
        tr.appendChild(td);
        idleBody.appendChild(tr);
    });

    // Showing NEW-GAME button only if idle
    var newGameArea = document.getElementById('newGameArea');
    newGameArea.innerHTML = '';
    if (myName_ui && myState_ui === 'idle') {
        var ng = document.createElement('button');
        ng.innerText = 'NEW-GAME';
        ng.style.display = 'block';
        ng.style.margin = '8px auto';
        ng.addEventListener('click', createNewGamePrompt_ui);
        newGameArea.appendChild(ng);
    }
}

/* 
 * Displays prompt allowing player to choose X or O and wait for opponent.
 * NEW behavior: opens a centered overlay (so the prompt is visible on top of the page).
 * This is purely UI; it still sends the server message NEW-GAME as before.
 */
function createNewGamePrompt_ui() {
    // overlay elements in DOM
    var overlay = document.getElementById('newGameOverlay');
    var content = document.getElementById('newGameOverlayContent');

    // opening overlay for starting new game
    if (!overlay || !content) {
        var newGameArea = document.getElementById('newGameArea');
        newGameArea.innerHTML = '';
        var msg = document.createElement('div'); 
        msg.innerText = 'Choose side to wait as:';
        var xBtn = document.createElement('button'); 
        xBtn.innerText = 'X';
        var oBtn = document.createElement('button'); 
        oBtn.innerText = 'O';
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

    // Build prompt content
    content.innerHTML = '';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'closeBtn';
    closeBtn.innerText = '✕';
    closeBtn.addEventListener('click', function() {
        overlay.classList.add('hidden');
        content.innerHTML = '';
    });

    var msg = document.createElement('div');
    msg.style.marginBottom = '10px';
    msg.innerText = 'Choose side to wait as:';

    var xBtn = document.createElement('button');
    xBtn.style.marginRight = '10px';
    xBtn.innerText = 'X';
    xBtn.addEventListener('click', function() {
        sendToServer_ui({ action: 'NEW-GAME', screenname: myName_ui, choice: 'X' });
        overlay.classList.add('hidden');
        content.innerHTML = '';
    });

    var oBtn = document.createElement('button');
    oBtn.innerText = 'O';
    oBtn.addEventListener('click', function() {
        sendToServer_ui({ action: 'NEW-GAME', screenname: myName_ui, choice: 'O' });
        overlay.classList.add('hidden');
        content.innerHTML = '';
    });

    content.appendChild(closeBtn);
    content.appendChild(msg);
    content.appendChild(xBtn);
    content.appendChild(oBtn);

    // show overlay
    overlay.classList.remove('hidden');
}

// ======================== Public API =========================
// so that accesble from different js files. (could have used ES6 modules but preferreed this)
window.ClientUI = {
    getMyName: function() { return myName_ui; },
    sendMove: function(screenname, cell) {
        sendToServer_ui({ action: 'MOVE', screenname: screenname, cell: cell });
    },
    sendEndGame: function(rowId, result, winner, winnerName) {
        sendToServer_ui({ action: 'END-GAME', rowId: rowId, result: result, winner: winner, winnerName: winnerName });
    }
};

