'use strict';

/*
 * Build the web app
 */


var strata = require('strata');
var content = require('./content');

var app = strata.urlMap();
app.run(defaultApp);

function defaultApp(env, cb) {
  var req = strata.Request(env);
  var res = strata.Response();
  console.warn(req.path);
  req.body(function (err, params) {
    if (err) return cb(err);
    console.warn(params);
    res.body = "Hello World";
    res.contentType = 'text/plain';
    res.send(cb);
  });
}

app.map('/admin', function (env, cb) {
  cb(200, {}, 'Hi');
});

module.exports = app;

