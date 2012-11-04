'use strict';

/*
 * Test app
 */

var strata = require('strata');
var mock = strata.mock;

var app = require('../lib/waverider');

var chai = require('chai-stack');
var t = chai.assert;

suite('app');

test('/ returns Hello World', function (done) {
  var env = mock.env({
    requestMethod: 'PUT',
    pathInfo: '/foo',
    params: { a: 1 }
  });
  mock.call(app, env, function (err, status, headers, body) {
    t.equal(body, 'Hello World');
    t.equal(headers['Content-Type'], 'text/plain');
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






