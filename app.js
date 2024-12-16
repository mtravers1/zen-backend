const express = require('express');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const createError = require('http-errors');
const cors = require('cors');
const firebaseAuth = require('./middlewares/firebaseAuth');

require('dotenv').config()

const app = express();

// database initialization
// require('./database/database');

app.use(cors());
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// authentication
app.use(firebaseAuth
  .unless({ 
    path: [
      '/api/auth/register',
      '/api/auth/login',
      '/api/auth/recoverypassword',
      '/api/_info/version'
    ]
}));

// Load routes
app.use('/api', require('./routes'));


// catch 404 and forward to error handler
app.use(function(req, res, next) {
    next(createError(404));
});


// error handler
app.use(function(err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};
  
    // render the error page
    res.status(err.status || 500);
    res.render('error');
  });

module.exports = app;
