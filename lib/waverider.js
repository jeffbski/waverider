'use strict';

/*
 * Build the web app
 */

var zlib = require('zlib');
var strata = require('strata');
var cm = require('./content-mgr');

var app = strata.build();

app.run(defaultApp);

/**
 * using host and path, determine content key
 */
function getKeyForRequest(req) {
  var key = cm.ckey(req.host, req.path);
  return key;
}

/**
 * prepare the response with meta info for GET and HEAD
 * cb(err, response)
 */
function prepareMeta(req, key, cb) {
  cm.getMeta(key, function (err, meta) {
    if (err) return cb(err);
    if (meta['Content-Encoding'] === 'gzip' && !req.acceptsEncoding('gzip')) {
      meta.preprocess = meta.preprocess || [];
      meta.preprocess.push('gunzip');
      meta.len = null; // it will change now, so use chunked encoding
      meta['Content-Encoding'] = null;
    }
    cb(null, meta);
  });
}

function prepareResponseFromMeta(meta) {
  var res = strata.Response();
  res.contentType = meta.type;
  if (meta.len) res.contentLength = meta.len;
  if (meta['Content-Encoding']) res.contentEncoding = meta['Content-Encoding'];
  res.etag = meta.digest;
  res.lastModified = meta.mtime;
  res.vary = 'Accept-Encoding';  // cache should vary based on whether gzip allowed
  return res;
}


function head(env, cb) {
  var req = new strata.Request(env);
  var key = getKeyForRequest(req);
  prepareMeta(req, key, function (err, meta) {
    if (err) return strata.utils.serverError(env, cb);
    var res = prepareResponseFromMeta(meta);
    res.transferEncoding = 'chunked'; // otherwise body needs to be empty string
    res.send(cb);
  });
}

function get(env, cb) {
  var req = new strata.Request(env);
  var key = getKeyForRequest(req);
  prepareMeta(req, key, function (err, meta) {
    if (err) return strata.utils.serverError(env, cb);
    var res = prepareResponseFromMeta(meta);
    var dataStream = cm.getDataStream(key);
    if (meta && Array.isArray(meta.preprocess) && meta.preprocess.indexOf('gunzip') !== -1) { // need to gunzip
      dataStream = dataStream.pipe(zlib.createGunzip());
    }
    res.body = dataStream;
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
}


app.map('/admin', function (app) {
  app.run(function (env, cb) {
    cb(200, {}, 'Hi');
  });
});




module.exports = app;

