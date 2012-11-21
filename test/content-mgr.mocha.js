'use strict';

var chai = require('chai-stack');
var Stream = require('stream');
var MemoryStream = require('memorystream');
var cm = require('../lib/content-mgr');
var digest = require('../lib/digest');
var crypto = require('crypto');
var zlib = require('zlib');
var through = require('through'); // through streams

var t = chai.assert;

function ensureDataIsBuffer(data) {
  /*jshint validthis:true */
  this.queue((Buffer.isBuffer(data)) ? data : new Buffer(data));
}

function createBufferThroughStream() {
  return through(ensureDataIsBuffer, function () {
    console.warn('queuing a null');
    this.queue(null); // queuing an end
  });
}

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
  var origDataArr = ["Hello ", "World", " Goodbye ", "World"];
  var rwStream = createBufferThroughStream();
  setTimeout(function () {
    origDataArr.forEach(function (x) { rwStream.write(x); });
    rwStream.end();
  }, 0);
  var contentType = 'text/plain';
  cm.set(KEY, rwStream, contentType, function (err, result) {
    t.isNull(err);
    cm.getData(KEY, function (err, data) {
      t.isNull(err);
      var origData = origDataArr.join('');
      t.equal(data, origData);
      cm.getMeta(KEY, function (err, meta) {
        var exptectedDigest = digest(origData);
        t.equal(meta.digest, exptectedDigest);
        done();
      });
    });
  });
});


test('cm.set(key, stream, type, metaGzip) compresses and saves stream, cm.getData(key, cb) retrieves data alone', function (done) {
  var meta = { preprocess: ['gzip'] };
  var origDataArr = ["<html><body><div>one", "</div><div>two</div><d", "iv>one</div><div>two</di", "v></body></html>"];
  var origData = origDataArr.join('');
  console.warn('origDataLen', origData.length);
  var rwStream = createBufferThroughStream();
  setTimeout(function () {
    origDataArr.forEach(function (x) { rwStream.write(x); });
    rwStream.end();
  }, 0);
  var contentType = 'text/html';
  cm.set(KEY, rwStream, contentType, meta, function (err, result) {
    t.isNull(err);
    cm.getData(KEY, function (err, data) {
      t.isNull(err);
      zlib.gunzip(data, function (err, unzippedData) {
        t.isNull(err);
        t.equal(unzippedData.length, origData.length);
        t.equal(digest(unzippedData), digest(origData));
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

test('through stream ends', function (done) {
  var ReadableStream = require('../lib/readable');
  var CHUNK_SIZE = 64 * 1024; // 64KB
  var DATA_LENGTH = 2 * 1024 * 1024 + 25; // 2,025 KB
  var rwStream = createBufferThroughStream();
  rwStream.on('end', function () { console.warn('rwStream received end'); });
  var bytesToGenerate = DATA_LENGTH;
  function gen() {
    var size = (bytesToGenerate > CHUNK_SIZE) ? CHUNK_SIZE : bytesToGenerate;
    var buff = crypto.randomBytes(size);
    rwStream.write(buff);
    bytesToGenerate -= size;
    if (!bytesToGenerate) {
      rwStream.end();
      console.warn('end was sent');
      return;
    }
    process.nextTick(gen);
  }
  process.nextTick(gen);
  var readable = new ReadableStream();
  readable.wrap(rwStream);
  var ended = false;
  readable.on('end', function () { ended = true; console.warn('end received'); flow(); });
  // readable.on('end', flow);
  function flow(err) {
    if (err) return done(err);
    var chunk = readable.read();
    if (!chunk) {
      console.warn('flow empty read, ended:', ended);
      if (ended) return handleNoDataEnded();
      return readable.once('readable', flow);
    }
    setTimeout(function () { // slow handling of data chunk
      console.warn('data len', chunk.length);
      process.nextTick(flow);
    }, 100);
  }
  var endHandled = false;
  function handleNoDataEnded() {
    if (!endHandled) {
      endHandled = true;
      console.warn('in handle end');
      done();
    }
  }
  flow();
  // rwStream
  //   .on('error', function (err) { done(err); })
  //   .on('data', function (data) { console.warn('data len', data.length); })
  //   .on('end', function () { console.warn('end received'); done(); });
});

test('simple through stream', function (done) {
  var CHUNK_SIZE = 64 * 1024; // 64KB
  var DATA_LENGTH = 2 * 1024 * 1024 + 25; // 2,025 KB
  var rwStream = createBufferThroughStream();
  var bytesToGenerate = DATA_LENGTH;
  function gen() {
    var size = (bytesToGenerate > CHUNK_SIZE) ? CHUNK_SIZE : bytesToGenerate;
    var buff = crypto.randomBytes(size);
    rwStream.write(buff);
    bytesToGenerate -= size;
    if (!bytesToGenerate) {
      rwStream.end();
      console.warn('end was sent');
      return;
    }
    process.nextTick(gen);
  }
  process.nextTick(gen);
  var readLength = 0;
  var pendingReads = 0;
  var ended = false;
  var endHandled = false;
  rwStream
    .on('error', function (err) { done(err); })
    .on('data', function (data) {
      pendingReads++;
      rwStream.pause();
      setTimeout(function () { // simulate slow handling of data
        readLength += data.length;
        pendingReads--;
        rwStream.resume();
        if (ended) handleEnd();
      }, 0);
    })
    .on('end', function () { ended = true; console.warn('on end'); handleEnd(); });
  function handleEnd() {
    if (endHandled) return;
    if (!pendingReads) {
      endHandled = true;
      t.equal(readLength, DATA_LENGTH);
      done();
    }
  }
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
      console.warn('end was sent');
      resultDigest = shasum.digest('base64');
      return;
    }
    process.nextTick(flow);
  }
  process.nextTick(flow);
  cm.set(KEY, rwStream, 'application/octet-stream', function (err, result) {
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

