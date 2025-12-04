<!DOCTYPE html>
<html lang="en">

<!-- imports socket io & css -->
<head>
    <link rel="stylesheet" href="./index.css">
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>tic-tac-toe game</title>
    <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
</head>

<body>
    <!-- structure of the login page -->
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

    <!-- login field -->
    <form id="login-form">
        <input type="text" name="screen_name" placeholder="Enter screen name" required>
        <input type="submit" value="Submit">
    </form>

    <!-- main functionality of the page -->
    <script>
        document.addEventListener("DOMContentLoaded", () => {

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

            // ==> LOGIN FORM HANDLING

            // references html elements
            const login_form = document.getElementById("login-form");
            const screenname_input = login_form.querySelector("input[name='screen_name']");
            const db_reset_btn = document.getElementById("db-reset-btn");

            // when submitting a screenname, broadcasts it via socket io if unique 
            login_form.addEventListener("submit", (e) => {
                // prevents reloading the page
                e.preventDefault();

                // gets screenname and checks if whitespace
                const screenname = screenname_input.value.trim();
                if (screenname === "") {
                    alert("Must enter a name >> Cannot be whitespace.");
                    return;
                }

                // sends formatted message to server via socket io
                const msg = `LOGIN ${screenname}`;
                socket.emit("login", msg);
                console.log("Sent login message:", msg);
            });

            // ==> SERVER RESPONSES

            // login success >> changes webpage to lobby.php
            socket.on("login_success", msg => {
                alert("Login successful!");
                const screen_name = screenname_input.value.trim();
                localStorage.setItem("screenname", screen_name);

                window.location.href = "lobby.php";
            });

            // login error >> communicates error message & clears input field
            socket.on("login_error", msg => {
                console.log("Server error:", msg);

                if (msg === "screenname-unavailable") {
                    alert("Screenname already taken. Please enter a different screenname."); // can change this to div popup later
                    screenname_input.value = "";
                }
                else {
                    alert("Login error: " + msg);
                }

            });
        });
    </script>
</body>

</html>
