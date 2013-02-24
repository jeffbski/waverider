'use strict';

/*
 * Test app
 */

var crypto = require('crypto');
var zlib = require('zlib');
var react = require('react');
var passStream = require('pass-stream');
var strata = require('strata');
var mock = strata.mock;

var app = require('../lib/waverider');
var cm = require('../lib/content-mgr');
var config = require('../config');

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
var cat = {
  host: 'localhost',
  path: '/cat',
  data: '<html><body><h1>Hello World!</h1></body></html>',
  type: 'text/html'
};
var arrData = [ foo, bar, cat ];
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

var setup = react('setup', 'foo, bar, cat, cb -> err', { locals: { cm: cm }},
  'cm.set', 'foo.key, foo.data, foo.type, cb -> err',
  addGzipData, 'foo, cb -> err',
  'cm.set', 'bar.key, bar.data, bar.type, cb -> err',
  addGzipData, 'foo, cb -> err',
  addGzipData, 'cat, cb -> err'
);

var cleanup = react('cleanup', 'foo, bar, cat, cb -> err', { locals: { cm: cm }},
  'cm.del', 'foo.key, cb -> err',
  'cm.del', 'bar.key, cb -> err',
  'cm.del', 'cat.key, cb -> err'
);

before(function (done) { setup(foo, bar, cat, done); });
after(function (done) { cleanup(foo, bar, cat, done); });

var TRANSIENT = {
  host: 'localhost',
  path: '/transient1'
};
TRANSIENT.key = cm.ckey(TRANSIENT.host, TRANSIENT.path);
function cleanupTransient(cb) {
  cm.del(TRANSIENT.key, cb);
}
beforeEach(cleanupTransient);
afterEach(cleanupTransient);


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
    var expires = Date.parse(headers.Expires);
    t.closeTo(expires, Date.now() + config.expireSecs * 1000, 1000, 'expires should be in the future');
    done();
  });
});

test('GET url includes meta data as headers prefixed with wr-', function (done) {
  var META = {
    title: 'My Foo',
    author: 'John Doe',
    'publish-start': '2012-12-01T23:23:59Z',
    'publish-end': '2012-12-25T23:23:59Z',
    keywords: 'foo, bar, baz',
    'created': '2012-01-30T23:59:59Z'
  };
  cm.set(TRANSIENT.key, 'Hello', 'text/plain', META, function (err, rdigest, len) {
    if (err) return done(err);
    var env = mock.env({
      requestMethod: 'GET',
      serverName: TRANSIENT.host,
      pathInfo: TRANSIENT.path
    });
    mock.call(app, env, function (err, status, headers, body) {
      t.equal(headers['Content-Type'], foo.type);
      Object.keys(META).forEach(function (k) {
        t.equal(headers['wr-' + k], META[k], 'should have ' + k);
      });
      var expWRHeaders = Object.keys(META).map(function (k) { return 'wr-' + k; });
      var WR_REGEX = /^wr-/;
      var otherKeys = Object.keys(headers).filter(function (k) {
        return (WR_REGEX.test(k) && expWRHeaders.indexOf(k) === -1);
      });
      t.deepEqual(otherKeys, [], 'should be no other keys');
      done();
    });
  });
});

test('HEAD url includes meta data as headers prefixed with wr-', function (done) {
  var META = {
    title: 'My Foo',
    author: 'John Doe',
    'publish-start': '2012-12-01T23:23:59Z',
    'publish-end': '2012-12-25T23:23:59Z',
    keywords: 'foo, bar, baz',
    'created': '2012-01-30T23:59:59Z'
  };
  cm.set(TRANSIENT.key, 'Hello', 'text/plain', META, function (err, rdigest, len) {
    if (err) return done(err);
    var env = mock.env({
      requestMethod: 'HEAD',
      serverName: TRANSIENT.host,
      pathInfo: TRANSIENT.path
    });
    mock.call(app, env, function (err, status, headers, body) {
      t.equal(headers['Content-Type'], foo.type);
      Object.keys(META).forEach(function (k) {
        t.equal(headers['wr-' + k], META[k], 'should have ' + k);
      });
      var expWRHeaders = Object.keys(META).map(function (k) { return 'wr-' + k; });
      var WR_REGEX = /^wr-/;
      var otherKeys = Object.keys(headers).filter(function (k) {
        return (WR_REGEX.test(k) && expWRHeaders.indexOf(k) === -1);
      });
      t.deepEqual(otherKeys, [], 'should be no other keys');
      done();
    });
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
    var expires = Date.parse(headers.Expires);
    t.closeTo(expires, Date.now() + config.expireSecs * 1000, 1000, 'expires should be in the future');
    done();
  });
});

test('HEAD /bar excludes expires since is text/html', function (done) {
  var env = mock.env({
    requestMethod: 'HEAD',
    serverName: bar.host,
    pathInfo: bar.path
  });
  mock.call(app, env, function (err, status, headers, body) {
    t.isUndefined(headers.Expires);
    done();
  });
});

test('HEAD /foo If-None-Match etag returns 304', function (done) {
  var env = mock.env({
    requestMethod: 'HEAD',
    serverName: foo.host,
    pathInfo: foo.path
  });
  mock.call(app, env, function (err, status, headers, body) {
    t.equal(headers.Etag, foo.digest);
    env.headers = { 'if-none-match': headers.Etag };
    mock.call(app, env, function (err, status, headers, body) {
      t.equal(status, 304, 'should be status not modified');
      t.equal(body, '');
      t.isUndefined(headers.Expires);
      done();
    });
  });
});

test('HEAD /foo If-None-Match wrongEtag returns 200', function (done) {
  var env = mock.env({
    requestMethod: 'HEAD',
    serverName: foo.host,
    pathInfo: foo.path
  });
  mock.call(app, env, function (err, status, headers, body) {
    t.equal(headers.Etag, foo.digest);
    env.headers = { 'if-none-match': 'FooFakeDigest' };
    mock.call(app, env, function (err, status, headers, body) {
      t.equal(status, 200, 'should be status success since etag wont match');
      var expires = Date.parse(headers.Expires);
      t.closeTo(expires, Date.now() + config.expireSecs * 1000, 1000, 'expires should be in the future');
      done();
    });
  });
});

test('GET /foo If-None-Match etag returns 304', function (done) {
  var env = mock.env({
    requestMethod: 'GET',
    serverName: foo.host,
    pathInfo: foo.path
  });
  mock.call(app, env, function (err, status, headers, body) {
    t.equal(headers.Etag, foo.digest);
    env.headers = { 'if-none-match': headers.Etag };
    mock.call(app, env, function (err, status, headers, body) {
      t.equal(status, 304, 'should be status not modified');
      t.equal(body, '');
      t.isUndefined(headers.Expires);
      done();
    });
  });
});

test('GET /foo If-None-Match wrongEtag returns 200', function (done) {
  var env = mock.env({
    requestMethod: 'GET',
    serverName: foo.host,
    pathInfo: foo.path
  });
  mock.call(app, env, function (err, status, headers, body) {
    t.equal(headers.Etag, foo.digest);
    env.headers = { 'if-none-match': 'FooFakeDigest' };
    mock.call(app, env, function (err, status, headers, body) {
      t.equal(status, 200, 'should be status success since etag wont match');
      var expires = Date.parse(headers.Expires);
      t.closeTo(expires, Date.now() + config.expireSecs * 1000, 1000, 'expires should be in the future');
      done();
    });
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
    var expires = Date.parse(headers.Expires);
    t.closeTo(expires, Date.now() + config.expireSecs * 1000, 1000, 'expires should be in the future');
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
    var expires = Date.parse(headers.Expires);
    t.closeTo(expires, Date.now() + config.expireSecs * 1000, 1000, 'expires should be in the future');
    done();
  });
});

test('PUT /cat stores and returns ETag', function (done) {
  var env = mock.env({
    requestMethod: 'PUT',
    serverName: cat.host,
    pathInfo: cat.path,
    input: passStream(),
    headers: { 'Content-Type': cat.type }
  });
  env.input.end(cat.data);
  mock.call(app, env, function (err, status, headers, body) {
    t.equal(headers.Etag, cat.digest);
    cm.getMeta(cat.key, function (err, meta) {
      t.equal(meta.type, cat.type);
      t.equal(meta.len, cat.gzipData.length);
      t.equal(meta.digest, cat.digest);
      t.isNotNull(meta.mtime);
      t.equal(meta['Content-Encoding'], 'gzip');
      t.isUndefined(headers.Expires);
      done();
    });
  });
});

test('PUT /cat stores "wr-" headers and returns ETag', function (done) {
  var META = {
    title: 'My Foo',
    author: 'John Doe',
    'publish-start': '2012-12-01T23:23:59Z',
    'publish-end': '2012-12-25T23:23:59Z',
    keywords: 'foo, bar, baz',
    'created': '2012-01-30T23:59:59Z'
  };
  var env = mock.env({
    requestMethod: 'PUT',
    serverName: cat.host,
    pathInfo: cat.path,
    input: passStream(),
    headers: {
      'Content-Type': cat.type,
      'wr-title': 'My Foo',
      'wr-author': 'John Doe',
      'wr-publish-start': '2012-12-01T23:23:59Z',
      'wr-publish-end': '2012-12-25T23:23:59Z',
      'wr-keywords': 'foo, bar, baz',
      'wr-created': '2012-01-30T23:59:59Z'
    }
  });
  env.input.end(cat.data);
  mock.call(app, env, function (err, status, headers, body) {
    t.equal(headers.Etag, cat.digest);
    cm.getMeta(cat.key, function (err, meta) {
      t.equal(meta.type, cat.type);
      t.equal(meta.len, cat.gzipData.length);
      t.equal(meta.digest, cat.digest);
      t.isNotNull(meta.mtime);
      t.equal(meta['Content-Encoding'], 'gzip');
      t.isUndefined(headers.Expires);
      Object.keys(META).forEach(function (k) {
        t.equal(meta[k], META[k], 'should have ' + k);
      });
      done();
    });
  });
});

test('GET w/gzip returns full HTML', function (done) {
  var data = '# Hello';
  cm.setFromSource(TRANSIENT.key, data, 'text/x-web-markdown', { wrapHTMLFragment: true },
                   function (err, rdigest, len) {
    if (err) return done(err);
    var env = mock.env({
      requestMethod: 'GET',
      serverName: TRANSIENT.host,
      pathInfo: TRANSIENT.path,
      headers: {
        'Accept-Encoding': 'gzip'
      }
    });
    env.mockReturnsBuffer = true;
    mock.call(app, env, function (err, status, headers, body) {
      zlib.gunzip(body, function (err, html) {
        if (err) return done(err);
        t.equal(headers['Content-Type'], 'text/html');
        t.isDefined(headers['Content-Length']);
        t.notEqual(html.toString().indexOf('<html>'), -1, 'should be full html');
        done();
      });
    });
  });
});

test('/admin returns Hi', function (done) {
  var env = mock.env({
    pathInfo: '/admin',
    requestMethod: 'GET'
  });
  mock.call(app, env, function (err, status, headers, body) {
    t.equal(body, 'Hi');
    t.isUndefined(headers.Expires);
    done();
  });
});






