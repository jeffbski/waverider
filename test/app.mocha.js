'use strict';

/*
 * Test app
 */

var crypto = require('crypto');
var zlib = require('zlib');
var react = require('react');
var passStream = require('pass-stream');
var strata = require('strata');
var mock = strata.mock;

var app = require('../lib/waverider');
var cm = require('../lib/content-mgr');

var chai = require('chai-stack');
var t = chai.assert;

function digest(data) {
  return crypto.createHash('sha1').update(data).digest('base64');
}

suite('app');

var foo = {
  host: 'localhost',
  path: '/foo',
  data: 'Hello World!',
  type: 'text/plain'
};
var bar = {
  host: 'localhost',
  path: '/bar',
  data: '<html><body><h1>Hello World!</h1></body></html>',
  type: 'text/html'
};
var cat = {
  host: 'localhost',
  path: '/cat',
  data: '<html><body><h1>Hello World!</h1></body></html>',
  type: 'text/html'
};
var arrData = [ foo, bar, cat ];
arrData.forEach(function (item) {
  item.key = cm.ckey(item.host, item.path);
  item.digest = digest(item.data);
});

function addGzipData(item, cb) {
  zlib.gzip(item.data, function (err, gzipData) {
    if (err) return cb(err);
    item.gzipData = gzipData;
    cb(null);
  });
}

var setup = react('setup', 'foo, bar, cat, cb -> err', { locals: { cm: cm }},
  'cm.set', 'foo.key, foo.data, foo.type, cb -> err',
  addGzipData, 'foo, cb -> err',
  'cm.set', 'bar.key, bar.data, bar.type, cb -> err',
  addGzipData, 'foo, cb -> err',
  addGzipData, 'cat, cb -> err'
);

var cleanup = react('cleanup', 'foo, bar, cat, cb -> err', { locals: { cm: cm }},
  'cm.del', 'foo.key, cb -> err',
  'cm.del', 'bar.key, cb -> err',
  'cm.del', 'cat.key, cb -> err'
);


before(function (done) { setup(foo, bar, cat, done); });
after(function (done) { cleanup(foo, bar, cat, done); });

test('GET /foo returns Hello World', function (done) {
  var env = mock.env({
    requestMethod: 'GET',
    serverName: foo.host,
    pathInfo: foo.path
  });
  mock.call(app, env, function (err, status, headers, body) {
    t.equal(body, foo.data);
    t.equal(headers['Content-Type'], foo.type);
    t.equal(headers['Transfer-Encoding'], 'chunked');
    t.equal(headers.Etag, foo.digest);
    t.isString(headers['Last-Modified'], 'should have last modified date');
    done();
  });
});

test('HEAD /foo returns meta', function (done) {
  var env = mock.env({
    requestMethod: 'HEAD',
    serverName: foo.host,
    pathInfo: foo.path
  });
  mock.call(app, env, function (err, status, headers, body) {
    t.equal(headers['Content-Type'], foo.type);
    t.equal(headers['Transfer-Encoding'], 'chunked');
    t.equal(headers.Etag, foo.digest);
    t.isString(headers['Last-Modified'], 'should have last modified date');
    done();
  });
});

test('HEAD /foo If-None-Match etag returns 304', function (done) {
  var env = mock.env({
    requestMethod: 'HEAD',
    serverName: foo.host,
    pathInfo: foo.path
  });
  mock.call(app, env, function (err, status, headers, body) {
    t.equal(headers.Etag, foo.digest);
    env.headers = { 'if-none-match': headers.Etag };
    mock.call(app, env, function (err, status, headers, body) {
      t.equal(status, 304, 'should be status not modified');
      t.equal(body, '');
      done();
    });
  });
});

// TODO test if etag doesn't match
// TODO GET etag match
// TODO GET etag not-match

test('GET /foo accepts gzip returns compressed Hello World', function (done) {
  var env = mock.env({
    requestMethod: 'GET',
    serverName: foo.host,
    pathInfo: foo.path,
    headers: {
      'Accept-Encoding': 'gzip'
    }
  });
  mock.call(app, env, function (err, status, headers, body) {
    t.equal(body, foo.gzipData);
    t.equal(headers['Content-Type'], foo.type);
    t.equal(headers['Content-Length'], foo.gzipData.length);
    t.equal(headers.Etag, foo.digest);
    t.isString(headers['Last-Modified'], 'should have last modified date');
    done();
  });
});

test('HEAD /foo accepts gzip returns meta', function (done) {
  var env = mock.env({
    requestMethod: 'HEAD',
    serverName: foo.host,
    pathInfo: foo.path,
    headers: {
      'Accept-Encoding': 'gzip'
    }
  });
  mock.call(app, env, function (err, status, headers, body) {
    t.equal(headers['Content-Type'], foo.type);
    t.equal(headers['Content-Length'], foo.gzipData.length);
    t.equal(headers.Etag, foo.digest);
    t.isString(headers['Last-Modified'], 'should have last modified date');
    done();
  });
});

test('PUT /cat stores and returns ETag', function (done) {
  var env = mock.env({
    requestMethod: 'PUT',
    serverName: cat.host,
    pathInfo: cat.path,
    input: passStream(),
    headers: { 'Content-Type': cat.type }
  });
  env.input.end(cat.data);
  mock.call(app, env, function (err, status, headers, body) {
    t.equal(headers.Etag, cat.digest);
    cm.getMeta(cat.key, function (err, meta) {
      t.equal(meta.type, cat.type);
      t.equal(meta.len, cat.gzipData.length);
      t.equal(meta.digest, cat.digest);
      t.isNotNull(meta.mtime);
      t.equal(meta['Content-Encoding'], 'gzip');
      done();
    });
  });
});

test('/admin returns Hi', function (done) {
  var env = mock.env({
    pathInfo: '/admin',
    requestMethod: 'GET'
  });
  mock.call(app, env, function (err, status, headers, body) {
    t.equal(body, 'Hi');
    done();
  });
});






