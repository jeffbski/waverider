'use strict';

var chai = require('chai-stack');
var prepare = require('../lib/prepare-db');
var rc = require('../lib/redis-client');
var t = chai.assert;

suite('prepare-db');

before(function (done) {
  prepare(done);
});

test('prepare(cb) creates namespaces hash if does not exist', function (done) {
  rc.hgetall('namespaces:', function (err, result) {
    t.isObject(result);
    t.isNotNull(result['cont:']);
    t.isNotNull(result['meta:']);
    t.isNotNull(result['id:']);
    t.isNotNull(result['url:']);
    t.isNotNull(result['srcurl:']);
    t.isNotNull(result['server:']);
    done();
  });
});

test('running prepare(cb) multiple times is fine', function (done) {
  rc.hget('server:', 'id', function (err, result) {
    if (err) return done(err);
    prepare(function (err) { // called in before and now again
      if (err) return done(err);
      rc.hget('server:', 'id', function (err, result2) {
        t.equal(result2, result, 'server id should be the same once created');
        done();
      });
    });
  });
});