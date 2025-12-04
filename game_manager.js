// declares variables for server setup
const cors = require('cors');
const app = require('express')();
app.use(cors());
const http_server = require('http').createServer(app);
const {Server} = require('socket.io');

// includes connection to db
const db_conn = require('./db_connect.js').dbCon;

// sets up socket io with CORS
const io = new Server(http_server, {
    cors: {origin: "*", methods: ["GET", "POST"]}
});

const players = {};

// gets player statuses asynchronously
function getAllPlayerStatuses(callback) {
    // selects screenames from sql table logged_in
    db_conn.query("SELECT screenname FROM logged_in", (err, all_players) => {
        if (err) return callback(err);

        // selects x & o players from sql table players
        db_conn.query("SELECT x_player, o_player FROM players", (err2, player_pairs) => {
            if (err2) return callback(err2);

            // maps player statuses >> if a player in a row is an x-player or o-player, they are in a match. If
            // both players in the row are in a match, the status is 'playing'. If only one player is in a match,
            // the status is 'waiting'. Otherwise, the status is 'idle'
            const player_statuses = all_players.map(p => {
                const name = p.screenname;
                let status = "idle";

                const match = player_pairs.find(row =>
                    row.x_player === name || row.o_player === name
                );

                if (match) {
                    if (match.x_player && match.o_player) {
                        status = "playing";
                    }
                    else {
                        status = "waiting";
                    }
                }

                return {name, status};
            });

            callback(null, player_statuses);
        });
    });
}

// broadcasts updated tables to all clients >> allows for asynchronous updates
function updateList() {
    getAllPlayerStatuses((err, statuses) => {
        if (err) {
            return console.error("Error fetching statuses:", err);
        }

        // gets all idle players
        const idlePlayers = statuses.filter(p => p.status === "idle").map(p => p.name);

        // selects x & o players from sql table players
        db_conn.query("SELECT x_player, o_player FROM players", (err, pairs) => {
            if (err) {
                return console.error("Error fetching active games:", err);
            }

            // gets all active players with row index for reference
            const activeGames = pairs.map((r, index) => ({
                row_index: index,
                x_player: r.x_player || null,
                o_player: r.o_player || null
            }));

            // sends messages to server via socket io >> updates all clients
            io.emit("update_idle_players", idlePlayers);
            io.emit("update_active_games", activeGames);
        });
    });
}

// socket connections
io.on('connection', (socket) => {
    // logs newly connected client
    console.log(`Client connected: ${socket.id}`);
    updateList();

    // registers a new player in memory for server-side tracking
    socket.on("register", (screenName) => {
        players[screenName] = socket.id;
        console.log("Registered", screenName, socket.id);
    });

    // get lobby status >> updates the tables 
    socket.on("get_lobby_status", () => {
        console.log(`Lobby status requested by ${socket.id}`);
        updateList();
    });

    // login handler >> ensures no duplicate screennames and appends user to the table of logged_in users (sql)
    socket.on('login', (msg) => {
        // ensures correct message formatting
        const parts = msg.trim().split(" ");
        if (parts.length !== 2 || parts[0].toUpperCase() !== "LOGIN") {
            socket.emit("login_error", "Invalid format. Use: LOGIN <screen_name>");
            return;
        }

        // gets screenname input
        const screenName = parts[1];

        // checks if screenname exists already in logged_in sql table
        db_conn.query("SELECT * FROM logged_in WHERE screenname = ?", [screenName], (err, result) => {
            // db login error handling
            if (err) {
                console.log("DB error:", err);
                socket.emit("login_error", "Database error.");
                return;
            }

            // returns result >> name exists
            if (result.length > 0) {
                socket.emit("login_error", "screenname-unavailable");
                return;
            }

            // inserts the new screenname into the sql table along with the current time
            db_conn.query("INSERT INTO logged_in (screenname, datetime) VALUES (?, NOW())", [screenName], (err2) => {
                // error handling
                if (err2) {
                    socket.emit("login_error", "Error saving login.");
                    return;
                }

                console.log(`${screenName} successfully logged in.`);

                // gets all player statuses
                getAllPlayerStatuses((err3, statuses) => {
                    // error handling
                    if (err3) {
                        socket.emit("login_error", "Error fetching player list.");
                        return;
                    }

                    // builds LOGIN-OK response
                    const response = "LOGIN-OK " + statuses.map(p => `${p.name} (${p.status})`).join(", ");

                    // sends LOGIN-OK to new client
                    socket.emit("login_success", response);
                    console.log("Sent:", response);

                    // notifies the other clients
                    socket.broadcast.emit("player_joined", screenName);

                    // updates the tables for all clients
                    updateList();
                });
            });
        });
    });

    // disconnect handler >> removes player from server memory
    socket.on('disconnect', () => {
        for (const name in players) {
            if (players[name] === socket.id) {
                delete players[name];
                break;
            }
        }
        console.log(`Client disconnected: ${socket.id}`);
        updateList();
    });

    // handles creation of a new game row in the database
    socket.on('new_game', (msg) => {
        const parts = msg.trim().split(" ");

        if (parts.length !== 3) {
            console.log("Incorrect NEW-GAME msg");
            return;
        }

        const screenName = parts[1];
        const team = parts[2];

        let query;

        // inserts player into the chosen team slot in a new row
        if (team === 'X') {
            query = "INSERT INTO players (x_player, o_player) VALUES (?, NULL)";
        }
        else {
            query = "INSERT INTO players (x_player, o_player) VALUES (NULL, ?)";
        }

        db_conn.query(query, [screenName], (err, result) => {
            if (err) {
                console.log("DB error during NEW-GAME:", err);
                return;
            }

            console.log(`${screenName} started a new game as ${team}`);

            updateList();
        })
    })

    // joins an existing game row >> fills in empty team slot
    socket.on("join_game", ({ row_index, team, player }) => {
        // retrieves all active games
        db_conn.query("SELECT x_player, o_player FROM players", (err, rows) => {
            if (err) {
                console.error(err);
                return;
            }

            const row = rows[row_index];
            if (!row) return;

            let query, params;

            // prepares update query based on chosen team
            if (team === "X" && !row.x_player) {
                query = "UPDATE players SET x_player = ? WHERE x_player IS NULL AND o_player = ?";
                params = [player, row.o_player];
            } else if (team === "O" && !row.o_player) {
                query = "UPDATE players SET o_player = ? WHERE x_player = ? AND o_player IS NULL";
                params = [player, row.x_player];
            } else {
                socket.emit("join_error", "Team already filled.");
                return;
            }

            // executes update query
            db_conn.query(query, params, (err) => {
                if (err) {
                    console.error(err);
                    return;
                }

                // retrieves updated row for starting game
                db_conn.query("SELECT x_player, o_player FROM players", (err, updated) => {
                    if (err) return console.error(err);

                    const updated_row = updated[row_index];
                    if (!updated_row) return;

                    const x_player = updated_row.x_player;
                    const o_player = updated_row.o_player;

                    //----added to receive for game playing on server side
                    io.to(players[x_player]).emit("your_symbol", 'X')
                    io.to(players[o_player]).emit("your_symbol", 'O')

                    // starts game if both players are present
                    if (x_player && o_player) {
                        const x_socket = players[x_player];
                        const o_socket = players[o_player];

                        if (x_socket) io.to(x_socket).emit("PLAY", { x_player, o_player });
                        if (o_socket) io.to(o_socket).emit("PLAY", { x_player, o_player });

                        console.log(`Starting game between ${x_player} and ${o_player}`);
                    }
                })

                console.log(`${player} joined game row ${row_index} as ${team}`);
                updateList();
                socket.emit("join_success", { row_index });
            })
        })
    })

    // move made handler >> relays move to opposing player
    socket.on("MOVE", (screenName, cell) => {
        db_conn.query("SELECT x_player, o_player FROM players WHERE x_player = ? OR o_player = ?", [screenName, screenName], (err, result) => {
            if (err) {
                console.log("DB error:", err);
                socket.emit("move_error", "Database error.");
                return;
            }

            if (result.length > 0) {
                const value = result[0];

                // sends move to opposing player
                if (value.x_player == screenName) {
                    io.to(players[value.o_player]).emit("MOVE", (cell))
                }
                else {
                    io.to(players[value.x_player]).emit("MOVE", (cell))
                }
            }
        })
    });

    // end game handlers >> notifies both players and deletes game row
    socket.on("END-GAME", (winner, screenName) => {

        db_conn.query("SELECT x_player, o_player FROM players WHERE x_player = ? OR o_player = ?", [screenName, screenName], (err, result) => {
            if (err) {
                console.log("DB error:", err);
                socket.emit("end_error", "Database error.");
                return;
            }

            if (result.length > 0) {
                const value = result[0];

                // sends winner info to initiating client
                socket.emit("END-GAME", (winner));

                // sends winner info to opposing player
                if (value.x_player == screenName) {
                    io.to(players[value.o_player]).emit("END-GAME", (winner))
                }
                else {
                    io.to(players[value.x_player]).emit("END-GAME", (winner))
                }
            }

            // deletes completed game row
            db_conn.query("DELETE FROM players  WHERE x_player = ? OR o_player = ?", [screenName, screenName], (err2, result2) => {
                if (err2) {
                    console.log("DB error:", err2);
                    socket.emit("end_error", "Database error.");
                    return;
                }

                // refreshes tables for all clients
                updateList()
            })
        })
    })
});

// starts the server on port 8081
const PORT = 8081;
http_server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
