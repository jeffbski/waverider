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
var defaultCMConfig = { };

beforeEach(function (done) {
  cm.config(defaultCMConfig);
  deleteAll(done);
});

after(function (done) {
  cm.config(defaultCMConfig);
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

test('cm.set(key, data, type, meta) saves content, cm.getData(key, cb) retrieves data alone', function (done) {
  var origContent = { data: 'Foo', type: 'text/plain' };
  cm.set(KEY, origContent.data, origContent.type, function (err, dataDigest, len, cid) {
    t.isNull(err);
    t.equal(dataDigest, digest(origContent.data));
    t.ok(len > 0);
    t.ok(cid, 'should return content id');
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
  cm.set(KEY, rwStream, contentType, function (err, dataDigest, len, cid) {
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
  cm.set(KEY, rwStream, contentType, meta, function (err, dataDigest, len, cid) {
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
  var meta = {
    title: 'My Foo',
    author: 'John Doe',
    'publish-start': '2012-12-01T23:23:59Z',
    'publish-end': '2012-12-25T23:23:59Z',
    keywords: 'foo, bar, baz',
    'created': '2012-01-30T23:59:59Z'
  };
  cm.set(KEY, origContent.data, origContent.type, meta, function (err, dataDigest, len, cid) {
    t.isNull(err);
    cm.getMeta(KEY, function (err, obj) {
      t.isNull(err);
      t.isObject(obj);
      t.equal(obj.type, origContent.type);
      t.equal(obj.digest, digest(origContent.data));
      t.equal(obj['Content-Encoding'], 'gzip');
      Object.keys(meta).forEach(function (k) {
        t.equal(obj[k], meta[k], 'should have ' + k);
      });
      zlib.gzip(origContent.data, function (err, data) {
        t.equal(obj.len, data.length);
        done();
      });
    });
  });
});

test('cm.getMeta(cid, cb) retrieves all the meta data for a CID', function (done) {
  var origContent = { data: 'Foo', type: 'text/plain' };
  var meta = {
    title: 'My Foo',
    author: 'John Doe',
    'publish-start': '2012-12-01T23:23:59Z',
    'publish-end': '2012-12-25T23:23:59Z',
    keywords: 'foo, bar, baz',
    'created': '2012-01-30T23:59:59Z'
  };
  cm.set(KEY, origContent.data, origContent.type, meta, function (err, dataDigest, len, cid) {
    t.isNull(err);
    cm.getMeta(cid, function (err, obj) {
      t.isNull(err);
      t.isObject(obj);
      t.equal(obj.type, origContent.type);
      t.equal(obj.digest, digest(origContent.data));
      t.equal(obj['Content-Encoding'], 'gzip');
      Object.keys(meta).forEach(function (k) {
        t.equal(obj[k], meta[k], 'should have ' + k);
      });
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
  cm.set(KEY, origContent.data, origContent.type, function (err, dataDigest, len, cid) {
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

test('cm.getData(cid) retrieves content by id', function (done) {
  var origContent = { data: 'Foo', type: 'text/plain' };
  cm.set(KEY, origContent.data, origContent.type, function (err, dataDigest, len, cid) {
    if (err) return done(err);
    t.ok(cid, 'should return content id');
    cm.getData(cid, function (err, data) {
      if (err) return done(err);
      t.equal(data, origContent.data);
      done();
    });
  });
});


test('cm.getAllVersions(key, options, cb) retrieves available cids', function (done) {
  var origContent = { data: 'Foo', type: 'text/plain' };
  var nextContent = { data: 'Bar', type: 'text/css' };
  cm.set(KEY, origContent.data, origContent.type, function (err, dataDigest, len, cid0) {
    if (err) return done(err);
    cm.set(KEY, nextContent.data, nextContent.type, function (err, dataDigest, len, cid1) {
      if (err) return done(err);
      cm.getAllVersions(KEY, {}, function (err, cids) {
        if (err) return done(err);
        t.deepEqual(cids, [cid1, cid0], 'should return arr with most recent first');
        done();
      });
    });
  });
});

test('cm.config(newConfig) sets config, cm.config() retrieves config', function () {
  var newConfig = { foo: 'bar' };
  cm.config(newConfig);
  t.deepEqual(cm.config(), newConfig);
});

test('with cm.config({revisions:2}) cm.set keeps only 2 revisions', function (done) {
  var origContent = { data: 'Foo', type: 'text/plain' };
  var nextContent = { data: 'Bar', type: 'text/css' };
  var thirdContent = { data: 'Cat', type: 'text/cat' };
  cm.config({ revisions: 2 });
  cm.set(KEY, origContent.data, origContent.type, function (err, dataDigest, len, cid0) {
    if (err) return done(err);
    cm.set(KEY, nextContent.data, nextContent.type, function (err, dataDigest, len, cid1) {
      if (err) return done(err);
      cm.set(KEY, thirdContent.data, thirdContent.type, function (err, dataDigest, len, cid2) {
        if (err) return done(err);
        cm.getAllVersions(KEY, {}, function (err, cids) {
          if (err) return done(err);
          t.deepEqual(cids, [cid2, cid1], 'should return arr with most recent first, limit 2');
          done();
        });
      });
    });
  });
});



test('cm.getDataStream(key) returns a gzipped stream to the content', function (done) {
  var origContent = { data: 'Foo', type: 'text/plain' };
  cm.set(KEY, origContent.data, origContent.type, function (err, dataDigest, len, cid) {
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

test('cm.getDataStream(cid) returns a gzipped stream to the content at cid', function (done) {
  var origContent = { data: 'Foo', type: 'text/plain' };
  cm.set(KEY, origContent.data, origContent.type, function (err, dataDigest, len, cid) {
    t.isNull(err);
    var readStream = cm.getDataStream(cid);
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
  cm.set(KEY, rwStream, 'application/octet-stream', function (err, dataDigest, len, cid) {
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

test('setFromSource with wrapHTMLFragment=true render HTML, save to key', function (done) {
  var data = '# Hello';
  cm.setFromSource(KEY, data, 'text/x-web-markdown', { wrapHTMLFragment: true },
                   function (err, digest, length) {
    if (err) return done(err);
    cm.getMeta(KEY, function (err, meta) {
      if (err) return done(err);
      t.equal(meta.type, 'text/html');
      t.equal(meta.sourceType, 'text/x-web-markdown');
      t.notEqual(meta.htmlType, 'fragment');
      cm.getData(KEY, function (err, htmlDataBuff) {
        if (err) return done(err);
        t.notEqual(htmlDataBuff.toString().indexOf('<html'), -1, 'should have wrapped html fragment');
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

test('setFromSourceKey wrapHTMLFragment=true retrieves source, render HTML, save to key', function (done) {
  var data = '# Hello';
  cm.set(KEY, data, 'text/x-web-markdown', { wrapHTMLFragment: true }, function (err, rdigest, length) {
    cm.setFromSourceKey(KEY2, KEY, function (err, rdigest, length) {
      cm.getMeta(KEY2, function (err, meta) {
        if (err) return done(err);
        t.equal(meta.type, 'text/html');
        t.equal(meta.sourceType, 'text/x-web-markdown');
        t.notEqual(meta.htmlType, 'fragment');
        t.equal(meta.srcKey, KEY);
        t.isNotNull(meta.srcId);
        cm.getData(KEY2, function (err, htmlDataBuff) {
          if (err) return done(err);
          t.notEqual(htmlDataBuff.toString().indexOf('<html'), -1, 'should have wrapped html fragment');
          done();
        });
      });
    });
  });
});