'use strict';

/*
 * content model
 *
 * incoming key should be <host>:<urlpath>
 *
 * For each save, get new contentId using incr of id: content
 *
 * set content in cont:<contentId>:
 * set meta in meta:<contentId>:
 *
 * For real content
 *   lpush (shift) url:<host>:<urlpath>: contentId
 *
 * For source content (like markdown)
 *   lpush (shift) srcurl:<host>:<urlpath>: contentId
 */

var digest = require('./digest');
var ReadableStream = require('./readable');
var RedisReadStream = require('./redis-readstream');
var util = require('util');
var zlib = require('zlib');
var react = require('react');
var rc = require('./redis-client');

// content_id_counter = hget id: content
var ID_COUNTER_NS = 'id:';
var CONTENT_ID_FIELD = 'content';

// cont:<contentId>
// meta:<contentId>
var CONTENT_NS = 'cont:';
var META_NS = 'meta:';

// meta fields
var TYPE = 'type';
var LEN = 'len';
var DIGEST = 'digest';
var MOD_TIME = 'mtime';

// key will be <host>:<urlpath>
// url:<host>:<urlpath> list to revisions (left is most recent)
// srcurl:<host>:<urlpath> list to src revisions (left is most recent)
var URL_NS = 'url:';
var SRC_URL_NS = 'srcurl:';

var FILTER_META_KEYS = ['preprocess']; // filter out these keys before giving meta data back

/**
 * calc content key from host and path
 */
function ckey(host, path) {
  return host + ':' + path;
}


function getNextContentId(cb) { // this should go into lua to run at server
  rc.hincrby(ID_COUNTER_NS, CONTENT_ID_FIELD, 1, cb);
}

function cns(contentId) {
  return CONTENT_NS + contentId;
}

function mns(contentId) {
  return META_NS + contentId;
}

function urlns(key) {
  return URL_NS + key;
}

function srcns(key) {
  return SRC_URL_NS + key;
}

function once(fn) {
  /*jshint validthis: true */
  var called = false;
  return function () {
    if (!called) {
      called = true;
      return fn.apply(this, arguments);
    }
  };
}

/**
 * if meta.preprocess includes gzip then return compressed data and update meta['Content-Encoding'] = 'gzip'
 * otherwise return original data
 */
function gzipIfPreprocessGzip(data, meta, cb) {
  if (meta && meta.preprocess && meta.preprocess.indexOf('gzip') !== -1) {
    console.warn('will gzip');
    meta['Content-Encoding'] = 'gzip';
    return zlib.gzip(data, cb);
  }
  return cb(null, data);
}

var getNextContentIdAndGzip = react('getNextContentIdAndGzip', 'data, meta, cb -> err, gzipData, contentId',
  getNextContentId, 'cb -> err, contentId',
  gzipIfPreprocessGzip, 'data, meta, cb -> err, gzipData'
);

/**
 * save data into redis, can pass data as string or stream.
 * @param key string host:urlpath
 * @param data string or stream
 * @param type string content type - saved as meta data `type` - required
 * @param meta optional object with additional meta data (`type`, `len` and `digest` will be overriden with actual values)
 */
function set(key, data, type, meta, cb) {
  if (typeof cb === 'undefined' && typeof meta === 'function') { // meta not provided
    cb = meta;
    meta = null;
  }
  if (data.on) return setStream(key, data, type, meta, cb); // stream use setStream
  getNextContentIdAndGzip(data, meta, function (err, data, contentId) {
    if (err) return cb(err);
    meta = meta || { };
    meta[TYPE] = type;
    meta[LEN] = data.length.toString();
    meta[DIGEST] = digest(data);
    meta[MOD_TIME] = meta[MOD_TIME] || (new Date()).toISOString();
    rc.multi()
    .set(cns(contentId), data)
    .hmset(mns(contentId), meta)
    .lpush(urlns(key), contentId)
    .exec(cb);
  });
}

function setStream(key, inStream, type, meta, cb) {
  cb = once(cb); // only all this to be called once
  var readable = new ReadableStream();
  var ended = false;
  readable.wrap(inStream);
  readable.on('error', function (err) { cb(err); });
  readable.on('end', function () { ended = true; console.warn('ended'); });
  getNextContentId(function (err, contentId) {
    if (err) return cb(err);
    var digester = digest();
    var length = 0;
    function flow(err) {
      console.warn('flow', err);
      if (err) return cb(err);
      var chunk = readable.read();
      if (!chunk) {
        console.warn('no chunk, ended:', ended);
        if (ended) return handleEnd();
        return readable.once('readable', flow);
      }
      handleChunk(chunk, flow);
    }
    function handleChunk(data, cb) {
      console.warn('handleChunk', data.length, length + data.length);
      digester.update(data);
      rc.append(cns(contentId), data, function (err, result) {
        if (err) return cb(err);
        length += data.length;
        console.warn('handleChunkAfterAppend sumlen', length);
        process.nextTick(cb); // cb == flow, next tick so we don't blow stack recursing
      });
    }
    var endHandled = false;
    function handleEnd() {
      if (!endHandled) {
        endHandled = true;
        meta = meta || { };
        meta[TYPE] = type;
        meta[LEN] = length.toString();
        meta[DIGEST] = digester.digest(digest.type);
        meta[MOD_TIME] = meta[MOD_TIME] || (new Date()).toISOString();
        rc.multi()
        .hmset(mns(contentId), meta)
        .lpush(urlns(key), contentId)
        .exec(cb);
      }
    }
    // this zeroing of previous key will happen before the stream starts
    rc.set(cns(contentId), '', function (err, result) { // zero key if previous existed
      if (err) return cb(err);
      readable.on('end', function () { console.warn('end hit will flow once more'); flow(); }); // if ends after all data was read, need to read flow once more
      flow();
    });
  });
}

/**
 * save source like markdown, render html, save html
 */
function setFromSource(key, data, type, meta, cb) {
  // TODO
}

function getContentIdForKey(key, cb) {
  rc.lindex(urlns(key), 0, cb);
}

function getData(key, cb) {
  getContentIdForKey(key, function (err, cid) {
    if (err) return cb(err);
    rc.get(new Buffer(cns(cid)), cb); // use buffer to switch to buffer ret value for safe binary
  });
}

function getDataStream(key) {
  var readable = new RedisReadStream();
  getContentIdForKey(key, function (err, cid) {
    if (err) return readable.emit('error', err);
    readable.setKey(cns(cid));
  });
  return readable;
}

function getMeta(key, cb) {
  getContentIdForKey(key, function (err, cid) {
    if (err) return cb(err);
    rc.hgetall(mns(cid), function (err, meta) {
      if (err) return cb(err);
      if (!meta) return cb(null, meta); // not found
      if (meta[MOD_TIME]) meta[MOD_TIME] = new Date(Date.parse(meta[MOD_TIME])); // convert to Date from ISO
      var resultMeta = Object.keys(meta).reduce(function (accum, k) {
        if (FILTER_META_KEYS.indexOf(k) === -1) accum[k] = meta[k]; // not in filter list include it
        return accum;
      }, {});
      cb(null, resultMeta);
    });
  });
}

function del(key, cb) {
  rc.lrange(urlns(key), 0, -1, function (err, cids) {
    if (err) return cb(err);
    cids.forEach(function (cid) { // TODO check for errors
      rc.del(cns(cid));
      rc.del(mns(cid));
    });
    rc.del(urlns(key), cb);
  });
}

var content = { };
content.ckey = ckey;
content.set = set;
content.getData = getData;
content.getDataStream = getDataStream;
content.getMeta = getMeta;
content.del = del;
module.exports = content;