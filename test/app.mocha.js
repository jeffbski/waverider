'use strict';

/*
 * Test app
 */

var crypto = require('crypto');
var zlib = require('zlib');
var react = require('react');
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
var arrData = [ foo, bar ];
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

var setup = react('setup', 'foo, bar, cb -> err', { locals: { cm: cm }},
  'cm.set', 'foo.key, foo.data, foo.type, cb -> err',
  addGzipData, 'foo, cb -> err',
  'cm.set', 'bar.key, bar.data, bar.type, cb -> err',
  addGzipData, 'foo, cb -> err'
);

var cleanup = react('cleanup', 'foo, bar, cb -> err', { locals: { cm: cm }},
  'cm.del', 'foo.key, cb -> err',
  'cm.del', 'bar.key, cb -> err'
);


before(function (done) { setup(foo, bar, done); });
after(function (done) { cleanup(foo, bar, done); });

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






