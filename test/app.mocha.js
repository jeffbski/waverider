'use strict';

/*
 * Test app
 */

var strata = require('strata');
var mock = strata.mock;

var app = require('../lib/waverider');
var cm = require('../lib/content-mgr');
var digest = require('../lib/digest');

var chai = require('chai-stack');
var t = chai.assert;

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

before(function (done) {
  cm.set(cm.ckey(foo.host, foo.path), foo.data, foo.type, function (err, result) {
    t.isNull(err);
    cm.set(cm.ckey(bar.host, bar.path), bar.data, bar.type, function (err, result) {
      t.isNull(err);
      done();
    });
  });
});

after(function (done) {
  cm.del(cm.ckey(foo.host, foo.path), function (err, result) {
    t.isNull(err);
    cm.del(cm.ckey(bar.host, bar.path), function (err, result) {
      t.isNull(err);
      done();
    });
  });
});

test('GET /foo returns Hello World', function (done) {
  var env = mock.env({
    requestMethod: 'GET',
    serverName: foo.host,
    pathInfo: foo.path
  });
  mock.call(app, env, function (err, status, headers, body) {
    t.equal(body, foo.data);
    t.equal(headers['Content-Type'], foo.type);
    t.equal(headers['Content-Length'], foo.data.length);
    t.equal(headers.Etag, digest(foo.data));
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
    t.equal(headers['Content-Length'], foo.data.length);
    t.equal(headers.Etag, digest(foo.data));
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






