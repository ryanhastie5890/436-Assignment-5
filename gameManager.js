/*
=====================================================================
File: gameManager.js
Author:antonio, ishaq
Date: November 2025
 EXPLANATION:
- I keep all active games in memory and manage players using the DB.
- Login, new game, join, move, and disconnect all delegate to mysql.js for DB changes.
- I carefully check for errors like duplicate logins or moves out of turn.
- I detect wins and draws and notify server to update all players.
Basically: Manages game state and uses mysql.js helper functions Game boards are kept in-memory keyed by players table id.
=====================================================================
*/


const db = require('./mysql.js');   // getting mysql

// I will be keep all active games in memory. The key is the row id from players table.
// Each value stores the board array 9 cells, whose turn it is, and player names.
var games = {}; // rowId -> { board: [null..], turn: 'X'|'O', x: name, o: name }

// ====================== INIT ======================
/* init
 * I am making sure all DB tables exist before starting the game server.
 */
function init(callback) {
  db.initTables(function(err) {
    callback(err);
  });
}

// ====================== BUILD STATUS LIST ======================
/*
 * I constructed an array of objects for all logged-in users, showing their
 * current state (idle/waiting/playing) and opponent if applicable.
 */
function buildStatusList(callback) {
  db.getLoggedIn(function(err, loggedRows) {
    if (err) return callback(err);

    db.getPlayers(function(err2, playerRows) {
      if (err2) return callback(err2);

      var statusMap = {};

      // Step 1: Assuming everyone is idle initially
      loggedRows.forEach(function(r) {
        statusMap[r.screenname] = { state: 'idle', opponent: null };
      });

      // Step 2: Updating each player's state based on the players table
      playerRows.forEach(function(row) {
        var x = row.x_player, o = row.o_player;

        if (x && o) {
          // Both players present -> they are playing
          if (statusMap[x]) statusMap[x] = { state: 'playing-X', opponent: o };
          if (statusMap[o]) statusMap[o] = { state: 'playing-O', opponent: x };
        } else if (x && !o) {
          // Only X is present -> waiting for O
          if (statusMap[x]) statusMap[x] = { state: 'waiting-X', opponent: null };
        } else if (o && !x) {
          // Only O is present -> waiting for X
          if (statusMap[o]) statusMap[o] = { state: 'waiting-O', opponent: null };
        }
      });

      // Step 3: Converting the status map into an array for the client
      var list = Object.keys(statusMap).map(function(name) {
        return { screenname: name, state: statusMap[name].state, opponent: statusMap[name].opponent };
      });

      callback(null, list);
    });
  });
}

// ====================== LOGIN ======================
/* 
 * I checked if the screenname is available, insert into logged_in table,
 * and then return LOGIN-OK along with the status list.
 */
function handleLogin(screenname, callback) {
  db.getLoggedIn(function(err, rows) {
    if (err) return callback(err);

    // Checking for duplicate login
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].screenname === screenname) {
        return callback(null, { action: 'screenname-unavailable' });
      }
    }

    // Inserting new logged-in user
    db.insertLoggedIn(screenname, function(err2) {
      if (err2) return callback(err2);

      // Return updated status list
      buildStatusList(function(err3, list) {
        if (err3) return callback(err3);
        callback(null, { action: 'LOGIN-OK', list: list });
      });
    });
  });
}

// ====================== NEW GAME ======================
/* 
 * I am creating a waiting row in the players table depending on the user's choice
 * (X or O) if they are not already in the table.
 */
function handleNewGame(screenname, choice, callback) {
  db.getLoggedIn(function(err, loggedRows) {
    if (err) return callback(err);

    // Check if the user is logged in
    var found = false;
    for (var i = 0; i < loggedRows.length; i++) {
      if (loggedRows[i].screenname === screenname) found = true;
    }
    if (!found) return callback(null, { action:'ERROR', message:'Not logged in' });

    // Checking if user is already in players table
    db.findPlayerRowByName(screenname, function(err2, prow) {
      if (err2) return callback(err2);
      if (prow.length > 0) return callback(null, { action:'ERROR', message:'Already in players table' });

      // Inserting row based on chosen symbol
      if (choice === 'X') {
        db.insertPlayer(screenname, null, function(err3) {
          if (err3) return callback(err3);
          buildStatusList(function(err4, list) {
            if (err4) return callback(err4);
            return callback(null, { action:'UPDATED-USER-LIST-AND-STATUS', list: list });
          });
        });
      } else {
        db.insertPlayer(null, screenname, function(err3) {
          if (err3) return callback(err3);
          buildStatusList(function(err4, list) {
            if (err4) return callback(err4);
            return callback(null, { action:'UPDATED-USER-LIST-AND-STATUS', list: list });
          });
        });
      }
    });
  });
}

// ====================== JOIN GAME ======================
/* 
 * I allow 'from' to join a waiting game of 'to'.
 * I prevent duplicate rows and clean up stray rows to maintain consistency.
 */
function handleJoin(from, to, callback) {
  // Step 1: Ensure 'from' isn't already in a game
  db.findPlayerRowByName(from, function(errA, fromRows) {
    if (errA) return callback(errA);

    // changed: only block if 'from' is already playing (both x_player and o_player present)
    var alreadyPlaying = false;
    if (fromRows && fromRows.length > 0) {
      for (var fi = 0; fi < fromRows.length; fi++) {
        var fr = fromRows[fi];
        if (fr.x_player && fr.o_player) {
          alreadyPlaying = true;
          break;
        }
      }
    }

    if (alreadyPlaying) {
      return buildStatusList(function(errL, listL) {
        if (errL) return callback(errL);
        return callback(null, { action:'ERROR', message:'You are already waiting or playing', list: listL });
      });
    }

    // Step 2: Find a waiting row for 'to'
    db.findWaitingRowByOpponent(to, function(errFind, rowsFind) {
      if (errFind) return callback(errFind);
      if (!rowsFind || rowsFind.length === 0) {
        return buildStatusList(function(err2, list) {
          if (err2) return callback(err2);
          return callback(null, { action:'ERROR', message:'Opponent not waiting', list: list });
        });
      }

      // Step 3: Determining which slot 'from' will fill (X or O)
      var waitingRow = rowsFind[0];
      var xName = waitingRow.x_player;
      var oName = waitingRow.o_player;

      if (!xName && oName) xName = from;          // 'from' becomes X
      else if (xName && !oName) oName = from;     // 'from' becomes O
      else return callback(null, { action:'ERROR', message:'Invalid waiting row' });

      // Step 4: Updating row in DB
      db.updatePlayerById(waitingRow.id, xName, oName, function(errUpd) {
        if (errUpd) return callback(errUpd);

        // Step 5: Clean up any other rows that involve 'from' or 'to' to prevent duplicates
        db.getPlayers(function(errP, allPlayers) {
          if (errP) console.error('cleanup error', errP);

          allPlayers.forEach(function(pRow) {
            if (
              pRow.id !== waitingRow.id &&
              (pRow.x_player === from || pRow.o_player === from || pRow.x_player === to || pRow.o_player === to)
            ) {
              db.deletePlayerById(pRow.id, function(){});
            }
          });

          // Step 6: Create in-memory game if both players are present
          if (xName && oName) {
            games[waitingRow.id] = { board: [null,null,null,null,null,null,null,null,null], turn: 'X', x: xName, o: oName };
          }

          return callback(null, { action:'PLAY', rowId: waitingRow.id, x: xName, o: oName });
        });
      });
    });
  });
}

// ====================== PLAYER MOVE ======================
/* 
 * I validated a move against the in-memory game.
 */
function handleMove(screenname, cell, callback) {
  db.findPlayerRowByName(screenname, function(err, rows) {
    if (err) return callback(err);
    if (rows.length === 0) return callback(null, { action:'ERROR', message:'Not playing' });

    var row = rows[0];
    var gid = row.id;

    // Step 1: Create in-memory game if missing
    if (!games[gid]) {
      if (row.x_player && row.o_player) {
        games[gid] = { board: [null,null,null,null,null,null,null,null,null], turn: 'X', x: row.x_player, o: row.o_player };
      } else return callback(null, { action:'ERROR', message:'Game not ready' });
    }

    var g = games[gid];
    var playerSymbol = (g.x === screenname) ? 'X' : (g.o === screenname) ? 'O' : null;

    // Step 2: Validating move
    if (!playerSymbol) return callback(null, { action:'ERROR', message:'Player not in game' });
    if (g.turn !== playerSymbol) return callback(null, { action:'ERROR', message:'Not your turn' });
    var idx = cell - 1;
    if (idx < 0 || idx > 8) return callback(null, { action:'ERROR', message:'Invalid cell' });
    if (g.board[idx] !== null) return callback(null, { action:'ERROR', message:'Cell occupied' });

    // Step 3: Apply move
    g.board[idx] = playerSymbol;
    g.turn = (g.turn === 'X') ? 'O' : 'X';
    var opponent = (playerSymbol === 'X') ? g.o : g.x;

    // Step 4: Check win
    var winner = checkWin(g.board);
    if (winner) {
      var winnerName = (winner === 'X') ? g.x : g.o;
      db.deletePlayerById(gid, function(){});
      delete games[gid];
      return callback(null, { action:'END-GAME', result:'WIN', winner, winnerName, players:[g.x, g.o], cell, symbol:playerSymbol });
    }

    // Step 5: Check draw
    if (checkDraw(g.board)) {
      db.deletePlayerById(gid, function(){});
      delete games[gid];
      return callback(null, { action:'END-GAME', result:'DRAW', players:[g.x, g.o], cell, symbol:playerSymbol });
    }

    // Step 6: Normaling move
    return callback(null, { action:'MOVED', cell, symbol:playerSymbol, opponent, next:g.turn, players:[g.x, g.o] });
  });
}

// ====================== DISCONNECT ======================
/* 
 * removing the user from logged_in and delete any players rows.
 */
function handleDisconnect(screenname, callback) {
  db.removeLoggedIn(screenname, function(err) {
    db.findPlayerRowByName(screenname, function(err2, rows) {
      if (err2) return callback(err2);

      rows.forEach(function(r) {
        var gid = r.id;
        db.deletePlayerById(gid, function(){});
        if (games[gid]) delete games[gid];
      });

      buildStatusList(function(err3, list) {
        if (err3) return callback(err3);
        callback(null, { action:'UPDATED-USER-LIST-AND-STATUS', list: list });
      });
    });
  });
}

// ====================== HELPERS ======================
/* 
 * checking all possible winning lines. If someone wins, return 'X' or 'O', else null.
 */
function checkWin(board) {
  var wins = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  for (var i = 0; i < wins.length; i++) {
    var a = wins[i][0], b = wins[i][1], c = wins[i][2];
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

/* 
 * check if no one can win anymore.
 * 1) checking the potential if a player can still win across all lines.
 * 2) If the board is full or can't be won by any player, it's a draw.
 */
function checkDraw(board) {
  var wins = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  // logic for testing any potential wins and to keep the game going
  var anyPotential = false;
  for (var i = 0; i < wins.length; i++) {
    var a = wins[i][0], b = wins[i][1], c = wins[i][2];
    var s = [board[a], board[b], board[c]];
    var hasX = s.indexOf('X') !== -1;
    var hasO = s.indexOf('O') !== -1;
    var emptyCount = numNull(s);
    if((numNull(board) == 2) && (emptyCount == 2) ){
      continue;
    }
    if (!(hasX && hasO)) { anyPotential = true; break; } // Potential win exists
  }
  if (!anyPotential) return true; // No line can win -> draw

  // Check if any empty cell exists 
  var emptyExists = false;
  for (var j = 0; j < board.length; j++) {
    if (board[j] === null) { emptyExists = true; break; }
  }
  if (!emptyExists) return true; // Board full -> draw

  return false; // Otherwise, game still ongoing
}

//function to see how many empty spaces
function numNull(board){
  let count = 0;
  for(let i = 0; i < board.length; i++){
     if(board[i]==null){
      count++
     }
  }
  return count;
}

// ====================== EXPORT API ======================
module.exports = {
  init,
  buildStatusList,
  handleLogin,
  handleNewGame,
  handleJoin,
  handleMove,
  handleDisconnect
};

