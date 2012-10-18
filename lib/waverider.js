'use strict';

/*
 * Build the web app
 */


var strata = require('strata');

var app = strata.urlMap();
app.run(defaultApp);

function defaultApp(env, cb) {
  cb(200, {}, 'Hello World');
}

app.map('/hello', function (env, cb) {
  cb(200, {}, 'Hi');
});

module.exports = app;

