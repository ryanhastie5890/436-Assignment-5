<!DOCTYPE html>
<html lang="en">

<!-- imports socket io & css -->

<head>
    <link rel="stylesheet" href="./index.css">
    <link rel="stylesheet" href="./lobby.css">
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tic-Tac-Toe Lobby</title>
    <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
</head>


<body>
    <!-- structure of the lobby page -->
    <!-- headings -->
    <h1>Tic-Tac-Toe Game</h1>
    <h2>By: Andrew Bodnar & Ryan Hastie</h2>
    <div id="howToPlay-openBtn" class="howToPlay">How to Play</div>

    <!-- how-to-play overlay & button -->
    <div id="howToPlay-overlay" class="howToPlay">
        <div>
            <button id="howToPlay-closeBtn" class="howToPlay">&times;</button>
            <h1>How to Play:</h1>
            <p style="text-align:center;">
                Welcome to the Tic-Tac-Toe Game!<br>
                To play you first must enter a screen name that has not been taken.<br>
                Once logged in you will see a list of games on the left. <br>
                If there is an opening in the game, click join to enter the game.<br>
                To create a new game, click the new game button and select X or O.<br>
                Once a game has both players, the board will appear at the bottom of the screen<br>
                The player playing as X will go first<br>
                When it is your turn, click an empty space to place your tile.<br>
                The first player with three of their tiles in a row will win.<br>
                After the game has ended, you can create a new game or join another.
            </p>
        </div>
    </div>

    <!-- players table -->
    <div class="lobby-container">
        <div class="table-box">
            <h3>Players</h3>
            <table id="activeGamesTable">
                <thead>
                    <tr>
                        <th>X Player</th>
                        <th>O Player</th>
                    </tr>
                </thead>
                <tbody id="activeGamesBody">
                    <tr>
                        <td colspan="2">No active games</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- idle clients table -->
        <div class="table-box">
            <h3>Idle Clients</h3>
            <table id="idlePlayersTable">
                <tbody id="idlePlayersBody">
                    <tr>
                        <td>No idle players</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <!-- new-game button -->
    <button id="newGameBtn">New Game</button>

    <div id="xo-prompt" style="display: none; margin-top:20px">
        <h3>Pick X or O</h3>
        <button class="xo-choice" data-choice="X">X</button>
        <button class="xo-choice" data-choice="O">O</button>
    </div>

    <!-- GAME SECTION (hidden until PLAY event) -->
    <div id="game-section" style="display:none; margin-top:40px;">
        <h2>Game In Progress</h2>

        <!--result of game space-->
        <h2 id="gameResult"></h2>

        <table id="game-info-table">
            <thead>
                <tr>
                    <th>X Player</th>
                    <th>O Player</th>
                    <th>Turn</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td id="x-label">-</td>
                    <td id="o-label">-</td>
                    <td id="turn-label">-</td>
                </tr>
            </tbody>
        </table>

        <div id="game-board">
            <div class="cell" data-cell="0" id="00"></div>
            <div class="cell" data-cell="1" id="01"></div>
            <div class="cell" data-cell="2" id="02"></div>

            <div class="cell" data-cell="3" id="10"></div>
            <div class="cell" data-cell="4" id="11"></div>
            <div class="cell" data-cell="5" id="12"></div>

            <div class="cell" data-cell="6" id="20"></div>
            <div class="cell" data-cell="7" id="21"></div>
            <div class="cell" data-cell="8" id="22"></div>
        </div>
    </div>


    <script>
        document.addEventListener("DOMContentLoaded", () => {
            //---global variables used in making makeMove. update based off of game
            let yourTurn = false;
            let yourSymbol = 'X';
            let screenName = "";

            //----set on click functions
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    document.getElementById(i.toString() + j.toString()).onclick = function () { makeMove(i.toString() + j.toString()); };
                }
            }

            // shows overlay
            function showOverlay(overlay) {
                overlay.style.display = 'flex';
            }

            // hides overlay
            function hideOverlay(overlay) {
                overlay.style.display = 'none';
            }

            // references html elements
            const howToPlay_overlay = document.getElementById("howToPlay-overlay");
            const howToPlay_openBtn = document.getElementById("howToPlay-openBtn");
            const howToPlay_closeBtn = document.getElementById("howToPlay-closeBtn");

            // sets event listeners for how-to-play overlay
            howToPlay_openBtn.addEventListener('click', () => { showOverlay(howToPlay_overlay); });
            howToPlay_closeBtn.addEventListener('click', () => { hideOverlay(howToPlay_overlay); });

            // connects socket to server
            const socket = io("http://localhost:8081");

            // references html
            const activeGamesBody = document.getElementById("activeGamesBody");
            const idlePlayersBody = document.getElementById("idlePlayersBody");
            const newGameBtn = document.getElementById("newGameBtn");

            // update active games >> resets html table, displays 'no active games ' if the sql table is empty, and
            // otherwise gets all players from the sql table and displays them in the html table
            socket.on("update_active_games", (games) => {
                activeGamesBody.innerHTML = "";
                if (games.length === 0) {
                    activeGamesBody.innerHTML = "<tr><td colspan='2'>No active games</td></tr>";
                    return;
                }
                games.forEach((game, row_index) => {
                    const row = document.createElement("tr");
                    const me = localStorage.getItem("screenname");

                    // X cell
                    const xCell = document.createElement("td");
                    if (game.x_player) {
                        xCell.textContent = game.x_player;
                    } else if (me !== game.o_player) {
                        const joinX = document.createElement("button");
                        joinX.textContent = "Join";
                        joinX.addEventListener("click", () => {
                            socket.emit("join_game", { row_index, team: "X", player: me });
                        });
                        xCell.appendChild(joinX);
                    }

                    // O cell
                    const oCell = document.createElement("td");
                    if (game.o_player) {
                        oCell.textContent = game.o_player;
                    } else if (me !== game.x_player) {
                        const joinO = document.createElement("button");
                        joinO.textContent = "Join";
                        joinO.addEventListener("click", () => {
                            socket.emit("join_game", { row_index, team: "O", player: me });
                        });
                        oCell.appendChild(joinO);
                    }

                    row.appendChild(xCell);
                    row.appendChild(oCell);
                    activeGamesBody.appendChild(row);
                });
            });

            // update idle players >> resets html table, displays 'no idle players' if the sql table is empty, and
            // otherwise gets all players from the sql table and displays them in the html table
            socket.on("update_idle_players", (players) => {
                idlePlayersBody.innerHTML = "";
                if (players.length === 0) {
                    idlePlayersBody.innerHTML = "<tr><td>No idle players</td></tr>";
                    return;
                }
                players.forEach(name => {
                    const row = document.createElement("tr");
                    row.innerHTML = `<td>${name}</td>`;
                    idlePlayersBody.appendChild(row);
                });
            });

            socket.on("PLAY", ({ x_player, o_player }) => {
                //----set on click functions
                for (let i = 0; i < 3; i++) {
                    for (let j = 0; j < 3; j++) {
                        document.getElementById(i.toString() + j.toString()).style.pointerEvents = "auto";
                        document.getElementById(i.toString() + j.toString()).innerHTML = "";
                    }
                }

                document.getElementById("game-section").style.display = "block";

                document.getElementById("x-label").textContent = x_player;
                document.getElementById("o-label").textContent = o_player;

                document.getElementById("turn-label").textContent = `X's turn`;

                const me = localStorage.getItem("screenname");
                if (me === x_player || me === o_player) {
                    document.getElementById("newGameBtn").style.display = "none";
                }
            })

            const name = localStorage.getItem("screenname");

            socket.on("connect", () => {
                socket.emit("register", name);
                console.log("Registered after entering lobby:", name, socket.id);
            });

            // new-game >> shows X/O prompt for user (which team to pick)
            newGameBtn.addEventListener("click", () => {
                newGameBtn.style.display = "none";
                document.getElementById("xo-prompt").style.display = "block";
            });

            document.querySelectorAll(".xo-choice").forEach(btn => {
                btn.addEventListener("click", () => {
                    const choice = btn.dataset.choice;

                    const screen_name = localStorage.getItem("screenname");

                    document.getElementById("xo-prompt").style.display = "none";

                    socket.emit("new_game", `NEW-GAME ${screen_name} ${choice}`);
                })
            })


            // broadcasts 'get lobby status' to the server
            socket.emit("get_lobby_status");
            //onclick function for table data
            function makeMove(cell) {
                if (yourTurn) {
                    if (document.getElementById(cell).innerHTML != "X" && document.getElementById(cell).innerHTML != "O") {
                        document.getElementById(cell).innerHTML = yourSymbol;
                        yourTurn = false;

                        document.getElementById("turn-label").textContent = (yourSymbol === "X" ? "O's Turn" : "X's Turn");

                        let checkResult = checkGame();
                        console.log(checkResult);

                        if (checkResult == "X has won") {
                            socket.emit("END-GAME", 'X', name);
                        }
                        else if (checkResult == "O has won") {
                            socket.emit("END-GAME", 'O', name);

                        }
                        else if (checkResult == "The game is a draw") {
                            socket.emit("END-GAME", 'D', name);

                        }

                        socket.emit("MOVE", name, cell)
                    }
                    else {
                        alert("This space is filled");
                    }
                }
                else {
                    alert("It is not your turn yet");
                }

            }

            //response to end game
            socket.on("END-GAME", (winner) => {
                if (winner == 'D') {
                    document.getElementById("gameResult").innerHTML = "The game is a draw";

                }
                else {
                    document.getElementById("gameResult").innerHTML = winner + " has won the game";
                }

                //disable buttons
                for (let i = 0; i < 3; i++) {
                    for (let j = 0; j < 3; j++) {
                        document.getElementById(i.toString() + j.toString()).style.pointerEvents = "none";
                    }
                }


                document.getElementById("newGameBtn").style.display = "block";
                console.log("test passed");

            })

            //response from a move being made
            socket.on("MOVE", (cell) => {
                if (yourSymbol == 'X')
                    document.getElementById(cell).innerHTML = 'O';
                else
                    document.getElementById(cell).innerHTML = 'X';




                yourTurn = true;

                document.getElementById("turn-label").textContent = `${yourSymbol}'s Turn`;
            })

            //---response to get symbol and turn
            socket.on("your_symbol", (symbol) => {
                yourSymbol = symbol;
                if (symbol == 'X') {
                    yourTurn = true;
                }
            })

            function makeMove(cell) {
                // checks if it's your turn
                if (yourTurn) {
                    // checks if cell is empty
                    if (document.getElementById(cell).innerHTML != "X" && document.getElementById(cell).innerHTML != "O") {
                        // places your symbol
                        document.getElementById(cell).innerHTML = yourSymbol;
                        yourTurn = false;

                        // updates turn label
                        document.getElementById("turn-label").textContent = (yourSymbol === "X" ? "O's Turn" : "X's Turn");

                        // checks game status
                        let checkResult = checkGame();
                        console.log(checkResult);

                        // ends game if someone won or draw
                        if (checkResult == "X has won") {
                            socket.emit("END-GAME", 'X', name);
                        }
                        else if (checkResult == "O has won") {
                            socket.emit("END-GAME", 'O', name);
                        }
                        else if (checkResult == "The game is a draw") {
                            socket.emit("END-GAME", 'D', name);
                        }

                        // sends move to server
                        socket.emit("MOVE", name, cell)
                    }
                    else {
                        // alerts if space is filled
                        alert("This space is filled");
                    }
                }
                else {
                    // alerts if not your turn
                    alert("It is not your turn yet");
                }
            }

            // response to end game
            socket.on("END-GAME", (winner) => {
                // shows result
                if (winner == 'D') {
                    document.getElementById("gameResult").innerHTML = "The game is a draw";
                }
                else {
                    document.getElementById("gameResult").innerHTML = winner + " has won the game";
                }

                // disables all board buttons
                for (let i = 0; i < 3; i++) {
                    for (let j = 0; j < 3; j++) {
                        document.getElementById(i.toString() + j.toString()).style.pointerEvents = "none";
                    }
                }

                // shows new game button
                document.getElementById("newGameBtn").style.display = "block";
                console.log("test passed");
            })

            // response from a move being made
            socket.on("MOVE", (cell) => {
                // places opponent's symbol
                if (yourSymbol == 'X')
                    document.getElementById(cell).innerHTML = 'O';
                else
                    document.getElementById(cell).innerHTML = 'X';

                // sets your turn
                yourTurn = true;

                // updates turn label
                document.getElementById("turn-label").textContent = `${yourSymbol}'s Turn`;
            })

            // ---response to get symbol and turn
            socket.on("your_symbol", (symbol) => {
                // sets your symbol
                yourSymbol = symbol;
                if (symbol == 'X') {
                    // X goes first
                    yourTurn = true;
                }
            })

            // function to check the status of the board
            function checkGame() {
                // ---- checks if X has won ----

                // checks rows
                for (let i = 0; i < 3; i++) {
                    let line = true;
                    for (let j = 0; j < 3; j++) {
                        if (document.getElementById(i.toString() + j.toString()).innerHTML == 'O' || document.getElementById(i.toString() + j.toString()).innerHTML == '') {
                            line = false;
                        }
                    }
                    if (line == true) return "X has won";
                }

                // checks columns
                for (let i = 0; i < 3; i++) {
                    let line = true;
                    for (let j = 0; j < 3; j++) {
                        if (document.getElementById(j.toString() + i.toString()).innerHTML == 'O' || document.getElementById(j.toString() + i.toString()).innerHTML == '') {
                            line = false;
                        }
                    }
                    if (line == true) return "X has won";
                }

                // checks diagonals
                let line = true;
                for (let i = 0; i < 3; i++) {
                    if (document.getElementById(i.toString() + i.toString()).innerHTML == 'O' || document.getElementById(i.toString() + i.toString()).innerHTML == '') {
                        line = false;
                    }
                }
                if (line == true) return "X has won";

                // checks second diagonal
                line = true;
                if (document.getElementById("02").innerHTML == 'O' || document.getElementById("02").innerHTML == '') line = false;
                if (document.getElementById("11").innerHTML == 'O' || document.getElementById("11").innerHTML == '') line = false;
                if (document.getElementById("20").innerHTML == 'O' || document.getElementById("20").innerHTML == '') line = false;
                if (line == true) return "X has won";

                // ---- checks if draw ----
                let draw = true;
                let zero = 0;

                // checks rows for draw
                for (let i = 0; i < 3; i++) {
                    let currentSymbol = document.getElementById(i.toString() + zero.toString()).innerHTML;
                    let possible = true;
                    let skip = false;

                    if (currentSymbol == '') {
                        second = document.getElementById(i.toString() + 1).innerHTML;
                        third = document.getElementById(i.toString() + 2).innerHTML;
                        if (second == '' || third == '') skip = true;
                        else if (second == third) skip = true;
                    }

                    if (skip == false) {
                        for (let j = 1; j < 3; j++) {
                            if (document.getElementById(i.toString() + j.toString()).innerHTML != '' && currentSymbol != document.getElementById(i.toString() + j.toString()).innerHTML) {
                                possible = false;
                            }
                        }
                    }

                    if (possible == true) draw = false;
                }

                // checks columns for draw
                for (let i = 0; i < 3; i++) {
                    let currentSymbol = document.getElementById(zero.toString() + i.toString()).innerHTML;
                    let possible = true;
                    let skip = false;

                    if (currentSymbol == '') {
                        second = document.getElementById(1 + i.toString()).innerHTML;
                        third = document.getElementById(2 + i.toString()).innerHTML;
                        if (second == '' || third == '') skip = true;
                        else if (second == third) skip = true;
                    }

                    if (skip == false) {
                        for (let j = 1; j < 3; j++) {
                            if (document.getElementById(j.toString() + i.toString()).innerHTML != '' && currentSymbol != document.getElementById(j.toString() + i.toString()).innerHTML) {
                                possible = false;
                            }
                        }
                    }

                    if (possible == true) draw = false;
                }

                // checks diagonals for draw
                currentSymbol = document.getElementById(zero.toString() + zero.toString()).innerHTML;
                possible = true;
                skip = false;

                if (currentSymbol == '') {
                    second = document.getElementById("11").innerHTML;
                    third = document.getElementById("22").innerHTML;
                    if (second == '' || third == '') skip = true;
                    else if (second == third) skip = true;
                }

                if (skip == false) {
                    for (let i = 0; i < 3; i++) {
                        if (document.getElementById(i.toString() + i.toString()).innerHTML != '' && currentSymbol != document.getElementById(i.toString() + i.toString()).innerHTML) {
                            possible = false;
                        }
                    }
                }

                if (possible == true) draw = false;

                currentSymbol = document.getElementById("02").innerHTML;
                possible = true;
                skip = false;

                if (currentSymbol == '') {
                    second = document.getElementById("11").innerHTML;
                    third = document.getElementById("20").innerHTML;
                    if (second == '' || third == '') skip = true;
                    else if (second == third) skip = true;
                }

                if (skip == false) {
                    if (document.getElementById("11").innerHTML != '' && document.getElementById("11").innerHTML != currentSymbol) possible = false;
                    if (document.getElementById("20").innerHTML != '' && document.getElementById("20").innerHTML != currentSymbol) possible = false;
                }

                if (possible == true) draw = false;

                if (draw == true) return "The game is a draw";

                // ---- checks if O has won ----

                // checks rows
                for (let i = 0; i < 3; i++) {
                    let line = true;
                    for (let j = 0; j < 3; j++) {
                        if (document.getElementById(i.toString() + j.toString()).innerHTML == 'X' || document.getElementById(i.toString() + j.toString()).innerHTML == '') line = false;
                    }
                    if (line == true) return "O has won";
                }

                // checks columns
                for (let i = 0; i < 3; i++) {
                    let line = true;
                    for (let j = 0; j < 3; j++) {
                        if (document.getElementById(j.toString() + i.toString()).innerHTML == 'X' || document.getElementById(j.toString() + i.toString()).innerHTML == '') line = false;
                    }
                    if (line == true) return "O has won";
                }

                // checks diagonals
                line = true;
                for (let i = 0; i < 3; i++) {
                    if (document.getElementById(i.toString() + i.toString()).innerHTML == 'X' || document.getElementById(i.toString() + i.toString()).innerHTML == '') line = false;
                }
                if (line == true) return "O has won";

                line = true;
                if (document.getElementById("02").innerHTML == 'X' || document.getElementById("02").innerHTML == '') line = false;
                if (document.getElementById("11").innerHTML == 'X' || document.getElementById("11").innerHTML == '') line = false;
                if (document.getElementById("20").innerHTML == 'X' || document.getElementById("20").innerHTML == '') line = false;
                if (line == true) return "O has won";

                // game still in progress
                return "Game is not finished";
            }

        });
    </script>
</body>

</html>