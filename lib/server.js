'use strict';

/*
 * Launch strata web server
 */


var strata = require('strata');
var app = require('./waverider');

var defaultServerOptions = { port: 2000 };
var runServer = true;

if (process.argv[2] === '--prepare-db') { // node server.js --prepare-db
  runServer = false;
  var prepareDB = require('./prepare-db');
  prepareDB(function (err) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log('DB has been prepared');
    process.exit(0);
  });
}

function run(options) {
  var opts = options || defaultServerOptions;
  var server = strata.createServer({ });
  strata.bind(run.app, server);
  strata.startServer(server, opts);
  return server;
}

run.app = app;
module.exports = (runServer) ? run(defaultServerOptions) : app;


