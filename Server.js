/*
=====================================================================
File: Server.js
Author: A. Ikeji, antonio, ishaq
Date: November 2025
Explanation:
- I set up a Node.js server using express and http to serve files.
- I use Socket.IO for real-time communication with players.
- I map each player's screenname to their socket.id so I can send messages directly to them.
- All game logic (login, creating games, joining, moving, ending) is delegated to gameManager.js.
- Whenever a player moves or game state changes, I broadcast updated status to all users.
- I carefully handle disconnects so players’ game state and DB entries are cleaned up.
Usage: 
- Just run: node server.js
- Then open in browser: http://<server-ip>:8080/index.html
- usig the above instad of http://<server-ip>:8080/lastFirst/assignment4/index.html cuz used in examples
Basically: manages all game logic and real-time communication, using file gameManager.js.
=====================================================================
*/

// SocketIO with node.js example
// By. A. Ikeji
//
// Note: All the require('...') used may need to be installed if not already installed 
// on your server. To install, use something like   npm install cors  or npm install -g cors  on the command line
//
// We will also use node as our http server (like our apache), hence we need the http library. We also bring in the express library although not necessary but it provides middleware functionalities for the node http-server.
// Note that you can still use the socket-io from javascripts loaded via apache. In other words, you can use apache as your webserver and node.js with socket-io is running on the host computer.

// ====================== MODULE IMPORTS ======================
// Here I import all the modules I need
const cors = require('cors');          // For handling cross-origin requests from clients
const express = require('express');    // Express for HTTP server
const app = require('express')();      // Initialize express app
app.use(cors());                       // Allow all cross-origin requests

const httpServer = require('http').createServer(app); // Create the HTTP server
const { Server } = require('socket.io');              // Import Socket.IO for real-time communication

// ====================== CORS / ORIGIN SETUP ======================
// Get public ip address and use it to setup CORS
var myIp=false;
const { execSync } = require('child_process');
try {
  const result = execSync('curl ip-adresim.app');
  myIp=result.toString();
	console.log(myIp);
} catch (error) {
  console.error('Error executing command:', error);
	exit();
}

const io = new Server(httpServer, {
    cors: {
        origin: [ myIp ],
        methods: ["GET", "POST"]
    }
});

// ====================== HTTP GET HANDLER ======================
// Here I serve static files like HTML, JS, CSS, and images, uncommented A. ikeji's code
app.use(express.static(__dirname));


// ====================== GAME MANAGER ======================
// I use my gameManager.js to handle all the game logic and DB interactions
const gm = require('./gameManager.js');

// Initialize the game manager, this also ensures tables exist in the DB
gm.init(function(err) {
    if (err) console.error('GameManager init error:', err);
    else console.log('GameManager initialized (tables created if needed).');
});

// ====================== SOCKET-USER MAPPING ======================
// I need to map screen names to socket IDs and vice versa
// This way I can send messages to specific users
var screenToSocket = {}; // Maps screenname -> socket.id
var socketToScreen = {}; // Maps socket.id -> screenname

// ====================== SOCKET.IO CONNECTION ======================
// This handles all connections from clients
io.on('connection', function(socket) {
    console.log('Client connected:', socket.id);

    // Listen for all game messages from the client
    socket.on('game-msg', function(data) {
        if (!data || !data.action) {
            // If the message is malformed, I immediately send back an error
            socket.emit('game-msg', { action:'ERROR', message:'Malformed message' });
            return;
        }
        var act = data.action;

        // ============================ LOGIN =============================
        if (act === 'LOGIN') {
            var screenname = (data.screenname || "").trim();
            if (!screenname) {
                socket.emit('game-msg', { action:'screenname-unavailable' });
                return;
            }

            // I store the mapping of the username and socket
            screenToSocket[screenname] = socket.id;
            socketToScreen[socket.id] = screenname;

            // Delegate the login to the game manager
            gm.handleLogin(screenname, function(err, res) {
                if (err) {
                    socket.emit('game-msg', { action:'ERROR', message: String(err) });
                    return;
                }
                if (res && res.action === 'screenname-unavailable') {
                    socket.emit('game-msg', { action:'screenname-unavailable' });
                } else if (res && res.action === 'LOGIN-OK') {
                    // I send the LOGIN-OK to the player who just logged in
                    socket.emit('game-msg', { action:'LOGIN-OK', list: res.list });
                    // Then I broadcast the updated user list to everyone
                    io.emit('game-msg', { action:'UPDATED-USER-LIST-AND-STATUS', list: res.list });
                }
            });
        }

        // ========================== NEW GAME ==========================
        else if (act === 'NEW-GAME') {
            // I delegate creation of a new game to gameManager
            gm.handleNewGame(data.screenname, data.choice, function(err, res) {
                if (err) {
                    socket.emit('game-msg', { action:'ERROR', message:String(err) });
                    return;
                }
                if (res && res.action === 'UPDATED-USER-LIST-AND-STATUS') {
                    // I broadcast the updated list so everyone sees new waiting games
                    io.emit('game-msg', { action:'UPDATED-USER-LIST-AND-STATUS', list: res.list });
                } else if (res && res.action === 'ERROR') {
                    socket.emit('game-msg', res);
                }
            });
        }

        // ============================= JOIN GAME =============================
        else if (act === 'JOIN') {
            // I delegate joining a game to gameManager
            gm.handleJoin(data.from, data.to, function(err, res) {
                if (err) {
                    socket.emit('game-msg', { action:'ERROR', message:String(err) });
                    return;
                }

                if (res && res.action === 'ERROR') {
                    socket.emit('game-msg', res);
                    // If there’s a status list, I update everyone
                    if (res.list) io.emit('game-msg', { action:'UPDATED-USER-LIST-AND-STATUS', list: res.list });
                } else if (res && res.action === 'PLAY') {
                    // If the game starts, I send the PLAY message to both players
                    var sidX = screenToSocket[res.x];
                    var sidO = screenToSocket[res.o];
                    if (sidX) io.to(sidX).emit('game-msg', { action:'PLAY', x: res.x, o: res.o, rowId: res.rowId });
                    if (sidO) io.to(sidO).emit('game-msg', { action:'PLAY', x: res.x, o: res.o, rowId: res.rowId });

                    // I also update the status list for everyone
                    gm.buildStatusList(function(err2, list2) {
                        if (!err2) io.emit('game-msg', { action:'UPDATED-USER-LIST-AND-STATUS', list: list2 });
                    });
                }
            });
        }

        // ============================ PLAYER MOVE ==========================
        else if (act === 'MOVE') {
            gm.handleMove(data.screenname, Number(data.cell), function(err, res) {
                if (err) {
                    socket.emit('game-msg', { action:'ERROR', message:String(err) });
                    return;
                }

                if (res && res.action === 'ERROR') {
                    // If player made an invalid move, I just forward the error
                    socket.emit('game-msg', res);
                    return;
                }

                if (res && res.action === 'MOVED') {
                    // I send the move only to the opponent so their board updates
                    var oppSid = screenToSocket[res.opponent];
                    if (oppSid) io.to(oppSid).emit('game-msg', { action:'MOVE', cell: res.cell, symbol: res.symbol, from: data.screenname });

                    // I send an acknowledgment back to the player who moved
                    socket.emit('game-msg', { action:'MOVE-ACK', cell: res.cell, symbol: res.symbol });

                    // Update everyone’s status list
                    gm.buildStatusList(function(err2, list2) {
                        if (!err2) io.emit('game-msg', { action:'UPDATED-USER-LIST-AND-STATUS', list: list2 });
                    });
                } else if (res && res.action === 'END-GAME') {
                    // If game ended (win/draw), I first send the last move to both players
                    if (res.cell && res.symbol && res.players && res.players.length) {
                        for (var i = 0; i < res.players.length; i++) {
                            var sid = screenToSocket[res.players[i]];
                            if (sid) io.to(sid).emit('game-msg', { action:'MOVE', cell: res.cell, symbol: res.symbol, from: data.screenname });
                        }
                    }

                    // Then I notify both players about the game result
                    if (res.players && res.players.length) {
                        for (var j = 0; j < res.players.length; j++) {
                            var sid2 = screenToSocket[res.players[j]];
                            if (sid2) io.to(sid2).emit('game-msg', res);
                        }
                    } else {
                        io.emit('game-msg', res);
                    }

                    // Update all users’ status list
                    gm.buildStatusList(function(err3, list3) {
                        if (!err3) io.emit('game-msg', { action:'UPDATED-USER-LIST-AND-STATUS', list: list3 });
                    });
                }
            });
        }

        // ===================== END-GAME EVENT =======================
        else if (act === 'END-GAME') {
            // If client tells server the game ended, I broadcast updated status and results
            gm.buildStatusList(function(err, list) {
                if (!err) io.emit('game-msg', { action:'UPDATED-USER-LIST-AND-STATUS', list: list });
                io.emit('game-msg', { action:'END-GAME', result: data.result, winner: data.winner, winnerName: data.winnerName });
            });
        }

        // ======================= UNKNOWN ACTION =======================
        else {
            // If I don’t recognize the action, I send an error back
            socket.emit('game-msg', { action:'ERROR', message:'Unknown action' });
        }
    });

    // ========================== DISCONNECT =============================
    socket.on('disconnect', function() {
        console.log('Client disconnected:', socket.id);
        var sn = socketToScreen[socket.id];
        if (sn) {
            delete socketToScreen[socket.id];
            delete screenToSocket[sn];

            // I handle the user logout and clean up DB/game state
            gm.handleDisconnect(sn, function(err, res) {
                if (!err && res && res.action === 'UPDATED-USER-LIST-AND-STATUS') {
                    io.emit('game-msg', res);
                }
            });
        }
    });
});

// ====================== START SERVER ======================
const PORT = 8081;
httpServer.listen(PORT, function() {
    console.log('Server listening on port ' + PORT);
});
