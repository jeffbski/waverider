'use strict';

var chai = require('chai-stack');
var cm = require('../lib/content-mgr');
var crypto = require('crypto');
var zlib = require('zlib');
var passStream = require('pass-stream');
var accum = require('accum');
var digestStream = require('digest-stream');
var lengthStream = require('length-stream');

var t = chai.assert;

function ensureDataIsBuffer(data) {
  /*jshint validthis:true */
  return (Buffer.isBuffer(data)) ? data : new Buffer(data);
}

function writeFn(data) {
  /*jshint validthis:true */
  this.queueWrite(ensureDataIsBuffer(data));
}

function createBufferThroughStream() {
  return passStream(writeFn);
}

function digest(data) {
  return crypto.createHash('sha1').update(data).digest('base64');
}

suite('content-mgr');

var KEY = '/foo';
var KEY2 = '/bar';

beforeEach(function (done) {
  deleteAll(done);
});

after(function (done) {
  deleteAll(done);
});

function deleteAll(cb) {
  cm.del(KEY, function (err) {
    if (err) return cb(err);
    cm.del(KEY2, cb);
  });
}

test('cm.ckey(host, path) calculates content key host:path', function () {
  t.equal(cm.ckey('localhost', '/foo/bar'), 'localhost:/foo/bar');
  t.equal(cm.ckey('localhost', '/cat'), 'localhost:/cat');
  t.equal(cm.ckey('abc.server.com', '/dog/food'), 'abc.server.com:/dog/food');
});

test('cm.set(key, data, type) saves content, cm.getData(key, cb) retrieves data alone', function (done) {
  var origContent = { data: 'Foo', type: 'text/plain' };
  cm.set(KEY, origContent.data, origContent.type, function (err, dataDigest, len) {
    t.isNull(err);
    t.equal(dataDigest, digest(origContent.data));
    t.ok(len > 0);
    cm.getData(KEY, function (err, data) {
      t.isNull(err);
      t.equal(data, origContent.data);
      done();
    });
  });
});

test('cm.set(key, stream, type) saves stream, cm.getData(key, cb) retrieves data alone', function (done) {
  var origDataArr = ["Hello ", "World", " Goodbye ", "World"];
  var rwStream = createBufferThroughStream();
  setTimeout(function () {
    origDataArr.forEach(function (x) { rwStream.write(x); });
    rwStream.end();
  }, 0);
  var contentType = 'text/plain';
  cm.set(KEY, rwStream, contentType, function (err, dataDigest, len) {
    t.isNull(err);
    cm.getData(KEY, function (err, data) {
      t.isNull(err);
      var origData = origDataArr.join('');
      t.equal(data, origData);
      cm.getMeta(KEY, function (err, meta) {
        var expectedDigest = digest(origData);
        t.equal(meta.digest, expectedDigest);
        t.equal(dataDigest, expectedDigest);
        done();
      });
    });
  });
});


test('cm.set(key, stream, type, metaGzip) compresses and saves stream, cm.getData(key, cb) retrieves data alone', function (done) {
  var meta = { preprocess: ['gzip'] };
  var origDataArr = ["<html><body><div>one", "</div><div>two</div><d", "iv>one</div><div>two</di", "v></body></html>"];
  var origData = origDataArr.join('');
  var rwStream = createBufferThroughStream();
  setTimeout(function () {
    origDataArr.forEach(function (x) { rwStream.write(x); });
    rwStream.end();
  }, 0);
  var contentType = 'text/html';
  cm.set(KEY, rwStream, contentType, meta, function (err, dataDigest, len) {
    t.isNull(err);
    cm.getData(KEY, function (err, data) {
      t.isNull(err);
      t.equal(data.length, origData.length);
      t.equal(digest(data), digest(origData));
      done();
    });
  });
});

test('cm.getMeta(key, cb) retrieves all the meta data', function (done) {
  var origContent = { data: 'Foo', type: 'text/plain' };
  cm.set(KEY, origContent.data, origContent.type, function (err, dataDigest, len) {
    t.isNull(err);
    cm.getMeta(KEY, function (err, obj) {
      t.isNull(err);
      t.isObject(obj);
      t.equal(obj.type, origContent.type);
      t.equal(obj.digest, digest(origContent.data));
      t.equal(obj['Content-Encoding'], 'gzip');
      zlib.gzip(origContent.data, function (err, data) {
        t.equal(obj.len, data.length);
        done();
      });
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
  cm.set(KEY, origContent.data, origContent.type, function (err, dataDigest, len) {
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
      t.equal(content.length, 0);
      done();
    });
  });
});



test('cm.getDataStream(key) returns a gzipped stream to the content', function (done) {
  var origContent = { data: 'Foo', type: 'text/plain' };
  cm.set(KEY, origContent.data, origContent.type, function (err, dataDigest, len) {
    t.isNull(err);
    var readStream = cm.getDataStream(KEY);
    readStream
      .on('error', function (err) { done(err); })
      .pipe(zlib.createGunzip())
      .pipe(accum.string(function (alldata) {
        t.equal(alldata, origContent.data);
        done();
      }));
  });
});

test('cm.setData and cm.getDataStream save and retrieve large binary data', function (done) {
  var CHUNK_SIZE = 64 * 1024; // 64KB
  var DATA_LENGTH = 2 * 1024 * 1024 + 25; // 2,025 KB
  var shasum = crypto.createHash('sha1');
  var resultDigest;
  var rwStream = createBufferThroughStream();
  var bytesToGenerate = DATA_LENGTH;
  function flow() {
    var size = (bytesToGenerate > CHUNK_SIZE) ? CHUNK_SIZE : bytesToGenerate;
    var buff = crypto.randomBytes(size);
    shasum.update(buff);
    rwStream.write(buff);
    bytesToGenerate -= size;
    if (!bytesToGenerate) {
      rwStream.end();
      resultDigest = shasum.digest('base64');
      return;
    }
    process.nextTick(flow);
  }
  process.nextTick(flow);
  cm.set(KEY, rwStream, 'application/octet-stream', function (err, dataDigest, len) {
    t.isNull(err);
    cm.getMeta(KEY, function (err, meta) {
      t.isNull(err);
      t.equal(meta.digest, resultDigest);

      var compressedLen;
      function lengthFn(len) {
        compressedLen = len;
      }
      var readStream = cm.getDataStream(KEY);
      readStream
        .pipe(lengthStream(lengthFn))
        .pipe(zlib.createGunzip())
        .pipe(digestStream('sha1', 'base64', function (digest, length) {
          t.equal(meta.len, compressedLen);
          t.equal(len, compressedLen);
          t.equal(meta.digest, digest);
          t.equal(dataDigest, digest);
          done();
        }));
    });
  });
});

test('setFromSource render HTML, save to key', function (done) {
  var data = '# Hello';
  cm.setFromSource(KEY, data, 'text/x-web-markdown', {}, function (err, digest, length) {
    if (err) return done(err);
    cm.getMeta(KEY, function (err, meta) {
      if (err) return done(err);
      t.equal(meta.type, 'text/html');
      t.equal(meta.sourceType, 'text/x-web-markdown');
      t.equal(meta.htmlType, 'fragment');
      cm.getData(KEY, function (err, htmlDataBuff) {
        if (err) return done(err);
        var expected = '<h1>Hello</h1>\n';
        t.equal(htmlDataBuff.toString(), expected);
        done();
      });
    });
  });
});

test('setFromSourceKey retrieves source, render HTML, save to key', function (done) {
  var data = '# Hello';
  cm.set(KEY, data, 'text/x-web-markdown', {}, function (err, rdigest, length) {
    cm.setFromSourceKey(KEY2, KEY, function (err, rdigest, length) {
      cm.getMeta(KEY2, function (err, meta) {
        if (err) return done(err);
        t.equal(meta.type, 'text/html');
        t.equal(meta.sourceType, 'text/x-web-markdown');
        t.equal(meta.htmlType, 'fragment');
        t.equal(meta.srcKey, KEY);
        t.isNotNull(meta.srcId);
        cm.getData(KEY2, function (err, htmlDataBuff) {
          if (err) return done(err);
          var expected = '<h1>Hello</h1>\n';
          t.equal(htmlDataBuff.toString(), expected);
          done();
        });
      });
    });
  });
});