'use strict';

/*
 * Launch strata web server
 */


var strata = require('strata');
var serverOptions = { port: 2000 };
var server = strata.createServer({ });

function defaultApp(env, cb) {
  cb(200, {}, 'Hello brave new world!');
}

strata.bind(defaultApp, server);
strata.startServer(server, serverOptions);


