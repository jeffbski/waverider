'use strict';

/*
 * Build the web app
 */


var strata = require('strata');
var cm = require('./content-mgr');

var app = strata.urlMap();
app.run(defaultApp);


/**
 * using host and path, determine content key
 */
function getKeyForRequest(env) {
  var req = strata.Request(env);
  var key = cm.ckey(req.host, req.path);
  return key;
}

/**
 * prepare the response with meta info for GET and HEAD
 * cb(err, response)
 */
function createResponseWithMeta(key, cb) {
  var res = strata.Response();
  cm.getMeta(key, function (err, meta) {
    if (err) return cb(err);
    res.contentType = meta.type;
    res.contentLength = meta.len;
    res.etag = meta.digest;
    res.lastModified = meta.mtime;
    cb(null, res);
  });
}


function head(env, cb) {
  var key = getKeyForRequest(env);
  createResponseWithMeta(key, function (err, res) {
    if (err) return strata.utils.serverError(env, cb);
    res.send(cb);
  });
}

function get(env, cb) {
  var key = getKeyForRequest(env);
  createResponseWithMeta(key, function (err, res) {
    if (err) return strata.utils.serverError(env, cb);
    res.body = cm.getDataStream(key);
    res.send(cb);
  });
}

var METHOD_HANDLERS = {
  HEAD: head,
  GET: get
};

function defaultApp(env, cb) {
  var handler = METHOD_HANDLERS[env.requestMethod];
  if (handler) return handler(env, cb);

  strata.utils.badRequest(env, cb);
  // var req = strata.Request(env);
  // var res = strata.Response();
  // // console.warn(req.path);
  // req.body(function (err, params) {
  //   if (err) return cb(err);
  //   // console.warn(params);
  //   res.body = "Hello World";
  //   res.contentType = 'text/plain';
  //   res.send(cb);
  // });
}


app.map('/admin', function (env, cb) {
  cb(200, {}, 'Hi');
});

module.exports = app;

