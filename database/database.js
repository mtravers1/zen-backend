const mongoose = require('mongoose');
const initialize = require('./datainit.js');

const mongoDB = process.env.MONGODB_URI || 'mongodb://localhost:27017';

mongoose.connect(mongoDB, {
    user: process.env.MONGODB_USER,
    pass: process.env.MONGODB_PASS,
    dbName: process.env.MONGODB_DB,
});

const mongoDBConnection = mongoose.connection;

mongoDBConnection.on('error', console.error.bind(console, 'MongoDB connection error:'));
mongoDBConnection.once('open', async function() {
    console.log('Connected to MongoDB!');

    await initialize();
});

mongoDBConnection.on('disconnected', function() {
    console.log('MongoDB disconnected!');
});

module.exports = { mongoDBConnection };