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

var redis = require('redis');
var digest = require('./digest');
var Readable = require('./readable');

var rc = redis.createClient();

// content_id_counter = hget id: content
var ID_COUNTER_NS = 'id:';
var CONTENT_ID_FIELD = 'content';

// cont:<contentId>
// meta:<contentId>
var CONTENT_NS = 'cont:';
var META_NS = 'meta:';

// content fields
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
  var readable = new Readable();
  readable.wrap(inStream);
  readable.on('error', function (err) { cb(err); });
  readable.pause();
  getNextContentId(function (err, contentId) {
    if (err) return cb(err);
    var digester = digest();
    var length = 0;
    function flow() {
      var chunk;
      while (null !== (chunk = readable.read())) {
        handleChunk(chunk);
      }
      readable.once('readable', flow);
    }
    function handleChunk(data) {
      rc.append(cns(contentId), data);
      digester.update(data);
      length += data.length;
    }
    readable.on('end', function () {
      meta = meta || { };
      meta[TYPE] = type;
      meta[LEN] = length.toString();
      meta[DIGEST] = digester.digest(digest.type);
      rc.multi()
      .hmset(mns(contentId), meta)
      .lpush(urlns(key), contentId)
      .exec(cb);
    });
    // this zeroing of previous key will happen before the stream starts
    rc.set(cns(contentId), '', function (err, result) { // zero key if previous existed
      if (err) return cb(err);
      flow();
      readable.resume();
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

//TODO these below are all broke, need to get contentid then get content

function getData(key, cb) {
  getContentIdForKey(key, function (err, cid) {
    if (err) return cb(err);
    rc.get(cns(cid), cb);
  });
}

function getMeta(key, cb) {
  getContentIdForKey(key, function (err, cid) {
    if (err) return cb(err);
    rc.hgetall(mns(cid), cb);
  });
}

function getType(key, cb) {
  getContentIdForKey(key, function (err, cid) {
    if (err) return cb(err);
    rc.hget(mns(cid), TYPE, cb);
  });
}

function getLength(key, cb) {
  getContentIdForKey(key, function (err, cid) {
    if (err) return cb(err);
    rc.hget(mns(cid), LEN, cb);
  });
}

function getDigest(key, cb) {
  getContentIdForKey(key, function (err, cid) {
    if (err) return cb(err);
    rc.hget(mns(cid), DIGEST, cb);
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
content.getMeta = getMeta;
content.getType = getType;
content.getLength = getLength;
content.getDigest = getDigest;
content.del = del;
module.exports = content;