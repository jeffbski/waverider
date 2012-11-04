'use strict';

var chai = require('chai-stack');
var cm = require('../lib/content-mgr');
var digest = require('../lib/digest');

var t = chai.assert;

suite('content-mgr');

var KEY = '/foo';

beforeEach(function (done) {
  deleteAll(done);
});

after(function (done) {
  deleteAll(done);
});

function deleteAll(cb) {
  cm.del(KEY, cb);
}

test('cm.set(key, obj) saves content, cm.getData(key, cb) retrieves just the data', function (done) {
  var origContent = { data: 'Foo', type: 'text/plain' };
  cm.set(KEY, origContent.data, origContent.type, function (err, result) {
    t.isNull(err);
    cm.getData(KEY, function (err, data) {
      t.isNull(err);
      t.equal(data, origContent.data);
      done();
    });
  });
});

test('cm.getMeta(key, cb) retrieves all the meta data', function (done) {
  var origContent = { data: 'Foo', type: 'text/plain' };
  cm.set(KEY, origContent.data, origContent.type, function (err, result) {
    t.isNull(err);
    cm.getMeta(KEY, function (err, obj) {
      t.isNull(err);
      t.isObject(obj);
      t.equal(obj.type, origContent.type);
      t.equal(obj.len, origContent.data.length);
      t.equal(obj.digest, digest(origContent.data));
      done();
    });
  });
});



test('cm.getData(key, cb) retrieves just the content', function (done) {
  var origContent = { data: 'Foo', type: 'text/plain' };
  cm.set(KEY, origContent.data, origContent.type, function (err, result) {
    t.isNull(err);
    cm.getData(KEY, function (err, content) {
      t.isNull(err);
      t.equal(content, origContent.data);
      done();
    });
  });
});

test('cm.getType(key, cb) retrieves just the type', function (done) {
  var origContent = { data: 'Foo', type: 'text/plain' };
  cm.set(KEY, origContent.data, origContent.type, function (err, result) {
    t.isNull(err);
    cm.getType(KEY, function (err, type) {
      t.isNull(err);
      t.equal(type, origContent.type);
      done();
    });
  });
});

test('cm.getLength(key, cb) retrieves just the length', function (done) {
  var origContent = { data: 'Foo', type: 'text/plain' };
  cm.set(KEY, origContent.data, origContent.type, function (err, result) {
    t.isNull(err);
    cm.getLength(KEY, function (err, len) {
      t.isNull(err);
      t.equal(len, origContent.data.length);
      done();
    });
  });
});

test('cm.getDigest(key, cb) retrieves the digest of the data', function (done) {
  var origContent = { data: 'Foo', type: 'text/plain' };
  cm.set(KEY, origContent.data, origContent.type, function (err, result) {
    t.isNull(err);
    cm.getDigest(KEY, function (err, dig) {
      t.isNull(err);
      t.equal(dig, digest(origContent.data), 'digest should match');
      done();
    });
  });
});