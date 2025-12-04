// Must be precedded by the mysql commands:
// create database 436db
// create user 436_mysql_user@"localhost" identified by "123pwd456ABC+";
// grant all privileges on 436db.* to 436_mysql_user@"localhost";
var mysql = require('mysql2');
// Create connection & verify credentials
var dbCon = mysql.createConnection(
    {
        host: 'localhost',
        user: '436_mysql_user',
        password: '123pwd456ABC+', // Ikeji msg >> change to 123pwd456ABC+
        database: '436db'
    }
);
dbCon.connect(function (error) {
    if (error) {
        console.log('Error connecting to DB ', error);
        return;
    }
    console.log('DBConnection established');
});

// export handle to the connection, for use in other models to access thd DB
exports.dbCon = dbCon;