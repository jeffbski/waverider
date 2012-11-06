'use strict';

var redis = require('redis');
var ReadableStream = require('./readable');
var util = require('util');

var rc = redis.createClient();

function RedisReadStream(key, options) {
  ReadableStream.call(this, options);
  this.redisKey = key;
  this.readBytes = 0;
  this.pendingReads = [];
}

util.inherits(RedisReadStream, ReadableStream);

/**
 * If key was not ready when stream was constructed, then it will
 * be set using this property later. If there were any reads before
 * this then emit readable
 */
RedisReadStream.prototype.setKey = function (key) {
  var self = this;
  this.redisKey = key;
  this.pendingReads.forEach(function (pendingRead) {
    self._redisRead(pendingRead.n, pendingRead.cb);
  });
  this.pendingReads.length = 0; // truncate
};

RedisReadStream.prototype._redisRead = function (n, cb) {
  var self = this;
  n = n || 64 * 1024;
  rc.getrange(this.redisKey, this.readBytes, n - 1, function (err, strBytes) {
    if (err) { self.emit('error', err); return; }
    self.readBytes += strBytes.length;
    cb(null, strBytes);
  });
};

RedisReadStream.prototype._read = function (n, cb) {
  if (!this.redisKey) return this.pendingReads.push({ n: n, cb: cb });
  this._redisRead(n, cb);
};


module.exports = RedisReadStream;