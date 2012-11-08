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

// key will be <host>:<urlpath>
// url:<host>:<urlpath> list to revisions (left is most recent)
// srcurl:<host>:<urlpath> list to src revisions (left is most recent)
var URL_NS = 'url:';
var SRC_URL_NS = 'srcurl:';


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
  getNextContentId(function (err, contentId) {
    if (err) return cb(err);
    meta = meta || { };
    meta[TYPE] = type;
    meta[LEN] = data.length.toString();
    meta[DIGEST] = digest(data);
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
  readable.wrap(inStream);
  readable.on('error', function (err) { cb(err); });
  getNextContentId(function (err, contentId) {
    if (err) return cb(err);
    var digester = digest();
    var length = 0;
    var ended = false;
    function flow(err) {
      if (err) return cb(err);
      var chunk = readable.read();
      if (!chunk) {
        if (ended) return handleEnd();
        return readable.once('readable', flow);
      }
      handleChunk(chunk, flow);
    }
    function handleChunk(data, cb) {
      digester.update(data);
      rc.append(cns(contentId), data, function (err, result) {
        if (err) return cb(err);
        length += data.length;
        cb(null);
      });
    }
    function handleEnd() {
      meta = meta || { };
      meta[TYPE] = type;
      meta[LEN] = length.toString();
      meta[DIGEST] = digester.digest(digest.type);
      rc.multi()
      .hmset(mns(contentId), meta)
      .lpush(urlns(key), contentId)
      .exec(cb);
    }
    readable.on('end', function () { ended = true; });
    // this zeroing of previous key will happen before the stream starts
    rc.set(cns(contentId), '', function (err, result) { // zero key if previous existed
      if (err) return cb(err);
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
    rc.hgetall(mns(cid), cb);
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
content.set = set;
content.getData = getData;
content.getDataStream = getDataStream;
content.getMeta = getMeta;
content.del = del;
module.exports = content;