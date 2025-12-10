running instructions:
1. pull the file from git to your local repository
2. upload folder to an ide (i use vs code)
3. upload code to aws server
4. sftp.json is a configuration file for uploading to remote aws server (i use)
   -if u want to use sftp.json to upload, just change some fields with your credentials(host, remotepath and privatekeypath will be diff for u so change)
5. make sure u have all the table names set properly( see previous data for strcture of table used)
6. this application runs on port 8080, so stop any other files listening on port 8080
7. start  server file using command => php -f ws_server.php
8. access the application via brower using url such as: http://<ip-address>/lastFirst/assignment5/  (ex: http://18.219.83.113/ahmedIshaq/assignment5/)
NOTE: Logout not working so fix this first. orelse you would have to manually truncate the tables after every run to avoid any funny bussiness.

Things to be done:
1. logout not working right now. in my assignment4, if I had refresh the browser the user would have logged out, I did not do it in here do it.
2. part 3 to be completed. laid the foundation. Just need to connect the dots. I guess you only need to make changes to client_game.js and somewhat game_manager.php, idk
3. we have to clean out the ws_server.php code. I was stuck a lot on here so had to google a lot, a lot of debugging messages and complex logic that can be easily simplified(lowest prioity)
4. overall clean up of all code files and proper documentation to be added.

if you have any problems getting this thing running just put a message in discord. I might respond if I am not sleeping (going to sleep though in like an hr)
Alright guyz !!! 



==========================================================================================
(previous data disregard)
1.All features were implemented correctly to best of my knowledge
2. MYSQL table creation
   a) "CREATE TABLE IF NOT EXISTS logged_in (screenname VARCHAR(50) PRIMARY KEY, datetime DATETIME)"
   b) "CREATE TABLE IF NOT EXISTS players (id INT AUTO_INCREMENT PRIMARY KEY, x_player VARCHAR(50), o_player VARCHAR(50))"