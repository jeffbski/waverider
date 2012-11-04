'use strict';

/*
 * content model
 */

var redis = require('redis');
var digest = require('./digest');

var rc = redis.createClient();

var CONTENT_NS = 'content:';
var META_NS = 'meta:';
var TYPE = 'type';
var LEN = 'len';
var DIGEST = 'digest';

function cns(key) {
  return CONTENT_NS + key;
}

function mns(key) {
  return META_NS + key;
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
  meta = meta || { };
  meta[TYPE] = type;
  meta[LEN] = data.length.toString();
  meta[DIGEST] = digest(data);
  rc.multi()
    .set(cns(key), data)
    .hmset(mns(key), meta)
    .exec(cb);
}

function setStream(key, inStream, type, meta, cb) {
  cb = once(cb); // only all this to be called once
  var ckey = cns(key);
  var digester = digest();
  var length = 0;
  inStream.on('error', function (err) { cb(err); });
  inStream.on('data', function (data) {
    rc.append(ckey, data);
    digester.update(data);
    length += data.length;
  });
  inStream.on('end', function () {
    meta = meta || { };
    meta[TYPE] = type;
    meta[LEN] = length.toString();
    meta[DIGEST] = digester.digest(digest.type);
    rc.hmset(mns(key), meta, cb);
  });
  // this zeroing of previous key will happen before the stream starts
  rc.set(ckey, '', function (err, result) { // zero key if previous existed
    if (err) return cb(err);
  });
}

function getData(key, cb) {
  rc.get(cns(key), cb);
}

function getMeta(key, cb) {
  rc.hgetall(mns(key), cb);
}

function getType(key, cb) {
  rc.hget(mns(key), TYPE, cb);
}

function getLength(key, cb) {
  rc.hget(mns(key), LEN, cb);
}

function getDigest(key, cb) {
  rc.hget(mns(key), DIGEST, cb);
}

function del(key, cb) {
  rc.multi()
    .del(cns(key))
    .del(mns(key))
    .exec(cb);
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