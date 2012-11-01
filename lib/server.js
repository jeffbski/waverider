'use strict';

/*
 * Launch strata web server
 */

var strata = require('strata');
var app = require('./waverider');

var defaultServerOptions = { port: 2000 };

function run(options) {
  var opts = options || defaultServerOptions;
  var server = strata.createServer({ });
  strata.bind(run.app, server);
  strata.startServer(server, opts);
  return server;
}

run.app = app;
module.exports = run(defaultServerOptions);


