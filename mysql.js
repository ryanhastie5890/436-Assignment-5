/*
=====================================================================
File: mysql.js
Author:A. Ikeji, antonio, ishaq
Date: November 2025
Explantion:
- This file handles all basic database operations for the game, including managing
- logged-in users and game rows. I created simple functions to query, insert, update,
   and delete records in `logged_in` and `players` tables, and to find specific rows.
- These helpers are used in gameManager.js to manage login, game creation, joining,
   moves, and cleanup when a player disconnects.
Basically: This module handles CRUD operations for the two main tables: logged_in and players. 
           Each function executes a SQL query and returns results via a callback.
=====================================================================
*/

var dbCon = require('./connectToDb.js').dbCon;

// ====== Initialize tables ====================
/* Creating required tables if they do not exist.
 * I have ensured logged_in and players tables exist.
 * I will be calling this during server startup to make sure DB schema is ready.
 */
function initTables(callback) {
    dbCon.query(
        "CREATE TABLE IF NOT EXISTS logged_in (screenname VARCHAR(50) PRIMARY KEY, datetime DATETIME)",
        function (err) {
            if (err) return callback(err);

            dbCon.query(
                "CREATE TABLE IF NOT EXISTS players (id INT AUTO_INCREMENT PRIMARY KEY, x_player VARCHAR(50), o_player VARCHAR(50))",
                function (err2) {
                    callback(err2);
                }
            );
        }
    );
}

// =========================LOGGED_IN table operations ============================
// Retrieving all logged-in users, ordered by screenname
function getLoggedIn(callback) {
    dbCon.query("SELECT screenname FROM logged_in ORDER BY screenname", callback);
}

// Inserting a new logged-in user with current timestamp
function insertLoggedIn(name, callback) {
    dbCon.query(
        "INSERT INTO logged_in (screenname, datetime) VALUES (?, NOW())",
        [name],
        callback
    );
}

// Removing a user from logged_in table when they disconnect
function removeLoggedIn(name, callback) {
    dbCon.query("DELETE FROM logged_in WHERE screenname = ?", [name], callback);
}

// ========================= PLAYERS table operations ================================
// Retrieving all rows from players table
function getPlayers(callback) {
    dbCon.query("SELECT * FROM players", callback);
}

// Inserting a new row in players table with optional X and O players
function insertPlayer(x, o, callback) {
    dbCon.query(
        "INSERT INTO players (x_player, o_player) VALUES (?, ?)",
        [x, o],
        callback
    );
}

// Updating a player row by its id
function updatePlayerById(id, x, o, callback) {
    dbCon.query(
        "UPDATE players SET x_player = ?, o_player = ? WHERE id = ?",
        [x, o, id],
        callback
    );
}

// Deleting a player row by its id
function deletePlayerById(id, callback) {
    dbCon.query("DELETE FROM players WHERE id = ?", [id], callback);
}

// Finding a waiting row for a given opponent
function findWaitingRowByOpponent(name, callback) {
    /* I am querying for players table rows where the given user is listed
     * as either x_player or o_player and the other side is still empty.
     * This helps in pairing a player who is waiting for an opponent.
     */
    dbCon.query(
        "SELECT * FROM players WHERE (x_player = ? OR o_player = ?) AND ((x_player IS NULL) XOR (o_player IS NULL))",
        [name, name],
        callback
    );
}

// Finding a player row with the given name
function findPlayerRowByName(name, callback) {
    /* I am searching for any player row that contains the given screenname
     * either as x_player or o_player.
     * This helps in checking if a player is already in a game.
     */
    dbCon.query(
        "SELECT * FROM players WHERE x_player = ? OR o_player = ?",
        [name, name],
        callback
    );
}

// Finding a player row by its ID
function findPlayerRowById(id, callback) {
    /* I have queried the players table by ID.
     * If the row exists, I will be returning it; otherwise null.
     */
    dbCon.query(
        "SELECT * FROM players WHERE id = ?",
        [id],
        function (err, rows) {
            if (err) return callback(err);
            callback(null, rows.length ? rows[0] : null);
        }
    );
}

/* Exported API
 */
module.exports = {
    initTables,
    getLoggedIn,
    insertLoggedIn,
    removeLoggedIn,
    getPlayers,
    insertPlayer,
    updatePlayerById,
    deletePlayerById,
    findWaitingRowByOpponent,
    findPlayerRowByName,
    findPlayerRowById
};

