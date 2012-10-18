
/*
 * Test app
 */

var strata = require('strata');
var mock = strata.mock;

var app = require('../').app;

var chai = require('chai');
var t = chai.assert;

suite('app');

test('/ returns Hello World', function (done) {
  mock.call(app, '/', function (err, status, headers, body) {
    t.equal(body, 'Hello World');
    done();
  });
});

test('/hello returns Hi', function (done) {
  mock.call(app, '/hello', function (err, status, headers, body) {
    t.equal(body, 'Hi');
    done();
  });
});






