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

function set(key, data, type, meta, cb) {
  if (typeof cb === 'undefined' && typeof meta === 'function') { // meta not provided
    cb = meta;
    meta = null;
  }
  meta = meta || { };
  meta[TYPE] = type;
  meta[LEN] = data.length.toString();
  meta[DIGEST] = digest(data);
  rc.multi()
    .set(cns(key), data)
    .hmset(mns(key), meta)
    .exec(cb);
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