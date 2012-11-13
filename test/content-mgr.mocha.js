'use strict';

var chai = require('chai-stack');
var Stream = require('stream');
var MemoryStream = require('memorystream');
var cm = require('../lib/content-mgr');
var digest = require('../lib/digest');
var crypto = require('crypto');
var zlib = require('zlib');

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

test('cm.ckey(host, path) calculates content key host:path', function () {
  t.equal(cm.ckey('localhost', '/foo/bar'), 'localhost:/foo/bar');
  t.equal(cm.ckey('localhost', '/cat'), 'localhost:/cat');
  t.equal(cm.ckey('abc.server.com', '/dog/food'), 'abc.server.com:/dog/food');
});

test('cm.set(key, data, type) saves content, cm.getData(key, cb) retrieves data alone', function (done) {
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

test('cm.set(key, data, type, metaGzip) gzips and content, cm.getData(key, cb) retrieves gzipped data', function (done) {
  var origContent = {
    data: '<html><body><div>one</div><div>two</div><div>one</div><div>two</div></body></html>',
    type: 'text/html'
  };
  var meta = { preprocess: ['gzip'] };
  cm.set(KEY, origContent.data, origContent.type, meta, function (err, result) {
    t.isNull(err);
    zlib.gzip(origContent.data, function (err, expectedGzipData) {
      t.isNull(err);
      cm.getData(KEY, function (err, data) {
        t.isNull(err);
        var expectedGzipDigest = digest(expectedGzipData);
        t.equal(digest(data), expectedGzipDigest);
        cm.getMeta(KEY, function (err, meta) {
          t.isNull(err);
          t.equal(meta.digest, expectedGzipDigest);
          t.equal(meta['Content-Encoding'], 'gzip');
          t.isUndefined(meta.preprocess, 'preprocess is stripped out in processing');
          zlib.gunzip(data, function (err, verifyData) {
            t.isNull(err);
            t.equal(verifyData, origContent.data);
            done();
          });
        });
      });
    });
  });
});

test('cm.set(key, stream, type) saves stream, cm.getData(key, cb) retrieves data alone', function (done) {
  var meta = { preprocess: ['gzip'] };
  var origDataArr = ["<html><body><div>one", "</div><div>two</div><d", "iv>one</div><div>two</di", "v></body></html>"];
  var wstream = new Stream();
  var rstream = new MemoryStream();
  wstream.pipe(rstream);
  setTimeout(function () {
    origDataArr.forEach(function (x) { wstream.emit('data', x); });
    wstream.emit('end');
  }, 0);
  var contentType = 'text/html';
  cm.set(KEY, rstream, contentType, meta, function (err, result) {
    t.isNull(err);
    cm.getData(KEY, function (err, data) {
      t.isNull(err);
      zlib.gzip(origDataArr.join(''), function (err, expectedGzipData) {
        t.isNull(err);
        var expectedGzipDigest = digest(expectedGzipData);
        t.equal(digest(data), expectedGzipDigest);
        cm.getMeta(KEY, function (err, meta) {
          t.equal(meta.digest, expectedGzipDigest);
          done();
        });
      });
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

test('cm.getMeta(nonExistentKey, cb) retrieves null meta data', function (done) {
  var nonExistentKey = '/nonExistentURL';
  cm.del(nonExistentKey, function (err, result) {
    t.isNull(err);
    cm.getMeta(nonExistentKey, function (err, meta) {
      t.isNull(err);
      t.isNull(meta);
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

test('cm.getData(nonExistentKey, cb) retrieves null content', function (done) {
  var nonExistentKey = '/nonExistentURL';
  cm.del(nonExistentKey, function (err, result) {
    t.isNull(err);
    cm.getData(nonExistentKey, function (err, content) {
      t.isNull(err);
      t.isNull(content);
      done();
    });
  });
});



test('cm.getDataStream(key) returns a stream to the content', function (done) {
  var origContent = { data: 'Foo', type: 'text/plain' };
  cm.set(KEY, origContent.data, origContent.type, function (err, result) {
    t.isNull(err);
    var readStream = cm.getDataStream(KEY);
    var accum = [];
    readStream
      .on('error', function (err) { done(err); })
      .on('data', function (data) { accum.push(data.toString()); })
      .on('end', function () {
        t.equal(accum.join(''), origContent.data);
        done();
      });
  });
});

test('cm.setData and cm.getDataStream save and retrieve large binary data', function (done) {
  var CHUNK_SIZE = 64 * 1024; // 64KB
  var DATA_LENGTH = 2 * 1024 * 1024 + 25; // 2,025 KB
  var shasum = crypto.createHash('sha1');
  var resultDigest;
  var wstream = new Stream();
  var rstream = new MemoryStream();
  wstream.pipe(rstream);
  var bytesToGenerate = DATA_LENGTH;
  function flow() {
    var size = (bytesToGenerate > CHUNK_SIZE) ? CHUNK_SIZE : bytesToGenerate;
    var buff = crypto.randomBytes(size);
    shasum.update(buff);
    wstream.emit('data', new Buffer(buff));
    bytesToGenerate -= size;
    if (!bytesToGenerate) {
      wstream.emit('end');
      resultDigest = shasum.digest('base64');
      return;
    }
    process.nextTick(flow);
  }
  process.nextTick(flow);
  cm.set(KEY, rstream, 'application/octet-stream', function (err, result) {
    t.isNull(err);
    cm.getMeta(KEY, function (err, meta) {
      t.isNull(err);
      t.equal(meta.len, DATA_LENGTH);
      t.equal(meta.digest, resultDigest);
      var readStream = cm.getDataStream(KEY);
      var readLength = 0;
      var readShasum = crypto.createHash('sha1');
      readStream
        .on('error', function (err) { done(err); })
        .on('data', function (data) {
          readLength += data.length;
          readShasum.update(data);
        })
        .on('end', function () {
          t.equal(readLength, DATA_LENGTH);
          t.equal(readShasum.digest('base64'), resultDigest);
          done();
        });
    });
  });
});

