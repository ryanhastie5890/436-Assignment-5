/*
=====================================================================
File: client_game.js
Author:antonio, ishaq
Date: November 2025
Explanation:
-This file handles the client-side game logic for tic-tac-toe:
- Managing board state and turns
- Handling optimistic moves and server acknowledgment
- Updating UI for moves, opponent moves, end-game, and turn display
- Sending moves and end-game results to the server via window.ClientUI
-It works together with client_ui.js, which handles network and DOM.
Basically: Managing client-side tic-tac-toe game state. Handling wrong moves, 
           turn display, end-game notifications,
           and sending moves/results to server using window.ClientUI.
=====================================================================
*/


// ====== Handling client-side game logic ====== 

var game_currentGame = null;        // Storing the current game information
var game_lastMove = null;           // Remembering last optimistic move waiting for server ack
var game_waitingForAck = false;     // Blocking multiple moves until server confirms previous move

/* Starting a new game when the server notifies a match
   Setting up board state, determining my symbol, initializing UI elements
*/
function startGame_game(data) {
  var myName = window.MY_SCREENNAME || null;
  var mySymbol = null;
  if (myName === data.x) mySymbol = 'X';
  else if (myName === data.o) mySymbol = 'O';

  // Initializing game state 
  game_currentGame = {
    rowId: data.rowId,
    x: data.x,
    o: data.o,
    mySymbol: mySymbol,
    board: [null,null,null,null,null,null,null,null,null],
    turn: 'X'
  };
  game_lastMove = null;
  game_waitingForAck = false;

  // showing board and initializing UI 
  document.getElementById('boardSection').classList.remove('hidden');

  renderBoard_game();
  
  // Showing initial turn immediately (X always starts)
  var initialName = (game_currentGame.turn === 'X') ? game_currentGame.x : game_currentGame.o;
  var myTurnInitial = (game_currentGame.mySymbol === game_currentGame.turn);
  document.getElementById('gameMsg').innerText =
  'Turn: ' + game_currentGame.turn + ' (' + initialName + ')' +
  (myTurnInitial ? ' — Your turn' : '');

  showTurn_game(game_currentGame.turn);

  document.getElementById('gameInfo').innerText = 'X: ' + data.x + '  —  O: ' + data.o;
  document.getElementById('newGameArea').innerHTML = '';
}

// creating the board 
// Creating buttons for each cell
function renderBoard_game() {
  var boardDiv = document.getElementById('board');
  boardDiv.innerHTML = '';
  for (var i=0; i<9; i++) {
    var btn = document.createElement('button');
    btn.dataset.cell = i+1;
    btn.innerText = game_currentGame.board[i] || '';
    btn.addEventListener('click', onCellClick_game);

    // Marking cell visually if already occupied
    if (game_currentGame.board[i] !== null) btn.classList.add('occupied');
    else btn.classList.remove('occupied');

    boardDiv.appendChild(btn);
  }
}

/* Handling a cell click from the player
   Checking for coorect turns, validating moves and flipping turn locally,
   and sending move to server
*/
function onCellClick_game(evt) {
  if (!game_currentGame || !game_currentGame.mySymbol) { alert('Not in a game'); return; }
  if (game_waitingForAck) { alert('Waiting for server to confirm previous move'); return; }

  var cell = Number(evt.currentTarget.dataset.cell);

  if (game_currentGame.turn !== game_currentGame.mySymbol) { alert('Not your turn'); return; }
  if (game_currentGame.board[cell-1]) { alert('Cell already occupied'); return; }

  // Placing symbol
  game_currentGame.board[cell-1] = game_currentGame.mySymbol;
  game_lastMove = { cell: cell, symbol: game_currentGame.mySymbol };
  game_waitingForAck = true;

  // Flipping turn 
  game_currentGame.turn = (game_currentGame.mySymbol === 'X') ? 'O' : 'X';
  renderBoard_game();
  showTurn_game(game_currentGame.turn);

  // Sending move to server
  var screenname = window.MY_SCREENNAME || document.getElementById('screennameInput').value.trim();
  if (window.ClientUI && typeof window.ClientUI.sendMove === 'function') {
    window.ClientUI.sendMove(screenname, cell);
  }
}

/* Handling server acknowledgment of my move
   Clearing waiting state and lastMove tracking
*/
function onMoveAck_game(data) {
  game_waitingForAck = false;
  game_lastMove = null;
}

/* Handling opponent move from server
   Updating board state, flipping turn, checking for win/draw,
   and sending end-game notification if necessary
*/
function onOpponentMove_game(data) {
  if (!game_currentGame) return;
  var cell = Number(data.cell);
  var sym = data.symbol;

  // Updating board if cell was empty
  if (!game_currentGame.board[cell-1]) {
    game_currentGame.board[cell-1] = sym;
  }

  // Flipping turn
  game_currentGame.turn = (sym === 'X') ? 'O' : 'X';
  renderBoard_game();
  showTurn_game(game_currentGame.turn);

  // Checking for win
  var winner = clientCheckWin_game(game_currentGame.board);
  if (winner) {
    var winnerName = (winner === 'X') ? game_currentGame.x : game_currentGame.o;
    if (window.ClientUI && typeof window.ClientUI.sendEndGame === 'function') {
      window.ClientUI.sendEndGame(game_currentGame.rowId, 'WIN', winner, winnerName);
    }
    showEndGame_game('WIN', winner, winnerName);
    return;
  }

  // Checking for draw
  if (clientCheckDraw_game(game_currentGame.board)) {
    if (window.ClientUI && typeof window.ClientUI.sendEndGame === 'function') {
      window.ClientUI.sendEndGame(game_currentGame.rowId, 'DRAW');
    }
    showEndGame_game('DRAW');
    return;
  }
}

/* Handling END-GAME message from server and showing result
*/
function onEndGame_game(data) {
  if (!game_currentGame) return;

  // Applying final cell move for some reason final move does get appliex so doing it here
  if (data.cell && data.symbol) {
    var c = Number(data.cell);
    if (!game_currentGame.board[c-1]) {
      game_currentGame.board[c-1] = data.symbol;
    }
    renderBoard_game();
  }

  // Showing end-game message
  if (data.result === 'WIN') {
    var winnerName = data.winnerName || 'Unknown';
    showEndGame_game('WIN', data.winner, winnerName);
  } else if (data.result === 'DRAW') {
    showEndGame_game('DRAW');
  } else {
    showEndGame_game('OTHER');
  }
}

/* Handling server errors for previous actions
*/
function onServerError_game(data) {
  var msg = data.message || 'Server error';

  if (game_waitingForAck && game_lastMove) {
    game_currentGame.board[game_lastMove.cell - 1] = null;
    game_waitingForAck = false;
    game_lastMove = null;
    game_currentGame.turn = game_currentGame.mySymbol;
    renderBoard_game();
    showTurn_game(game_currentGame.turn);
  }

  // Showing appropriate alert
  if (msg.indexOf('Not your turn') !== -1) {
    alert('Not your turn');
  } else if (msg.indexOf('Cell occupied') !== -1) {
    alert('Cell already occupied');
  } else {
    alert('Server error: ' + msg);
  }
}

/* Displaying end-game message and resetting UI
   Creating NEW-GAME button for user to start next match
*/
function showEndGame_game(type, winner, winnerName) {
  if (type === 'WIN') {
    document.getElementById('gameMsg').innerText = 'Game over. Winner: ' + (winnerName || ('(' + winner + ')'));
  } else if (type === 'DRAW') {
    document.getElementById('gameMsg').innerText = 'Game over. Draw.';
  } else {
    document.getElementById('gameMsg').innerText = 'Game ended.';
  }

  // Disabling board buttons
  var btns = document.querySelectorAll('#board button');
  for (var i=0; i<btns.length; i++) btns[i].disabled = true;

  // Showing NEW-GAME button
  var area = document.getElementById('newGameArea');
  area.innerHTML = '';
  var ng = document.createElement('button'); 
  ng.innerText = 'NEW-GAME';
  ng.addEventListener('click', function(){ 
    area.innerHTML = '';
    var msg = document.createElement('div'); 
    msg.innerText = 'Choose side to wait as:';
    var xBtn = document.createElement('button'); xBtn.innerText = 'X';
    var oBtn = document.createElement('button'); oBtn.innerText = 'O';
    area.appendChild(msg); area.appendChild(xBtn); area.appendChild(oBtn);
  });
  area.appendChild(ng);

  // Resetting game state
  game_currentGame = null;
  game_lastMove = null;
  game_waitingForAck = false;
}

// Updating turn display and visual board state
function showTurn_game(next) {
  if (!game_currentGame) return;

  game_currentGame.turn = next;
  var nextName = (next === 'X') ? game_currentGame.x : game_currentGame.o;
  var myTurn = (game_currentGame.mySymbol === next);
  document.getElementById('gameMsg').innerText = 'Turn: ' + next + ' (' + nextName + ')' + (myTurn ? ' — Your turn' : '');

  // updates stylign
  var btns = document.querySelectorAll('#board button');
  for (var i=0; i<btns.length; i++) {
    var idx = Number(btns[i].dataset.cell) - 1;
    if (game_currentGame.board[idx] !== null) btns[i].classList.add('occupied');
    else btns[i].classList.remove('occupied');
  }
}

/* Checking for a winner on the current board */
function clientCheckWin_game(board) {
  var wins = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (var i=0; i<wins.length; i++) {
    var a = wins[i][0], b = wins[i][1], c = wins[i][2];
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

/* Checking for a draw on the current board */
function clientCheckDraw_game(board) {
  var wins = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  var anyPotential = false;
  for (var i=0; i<wins.length; i++) {
    var a = wins[i][0], b = wins[i][1], c = wins[i][2];
    var s = [board[a], board[b], board[c]];
    var hasX = s.indexOf('X') !== -1;
    var hasO = s.indexOf('O') !== -1;
    if (!(hasX && hasO)) { anyPotential = true; break; }
  }
  if (!anyPotential) return true;
  var empty = false;
  for (var j=0; j<board.length; j++) if (board[j] === null) { empty = true; break; }
  if (!empty) return true;
  return false;
}

/* Exporting functions for UI/socket layer to call */
window.ClientGame = {
  startGame: startGame_game,
  onOpponentMove: onOpponentMove_game,
  onEndGame: onEndGame_game,
  onMoveAck: onMoveAck_game,
  onServerError: onServerError_game,
  showTurn: showTurn_game
};

