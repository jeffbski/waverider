'use strict';

var ReadableStream = require('./readable');
var util = require('util');
var rc = require('./redis-client');

var DEFAULT_REDIS_READ_SIZE = 64 * 1024; // default 64K

function RedisReadStream(key, options) {
  ReadableStream.call(this, options);
  this.redisKey = (key) ? new Buffer(key) : null; // makes this use buffer as return value for safe binaries
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
  this.redisKey = new Buffer(key); // makes this use buffer as return value for safe binaries
  this.pendingReads.forEach(function (pendingRead) {
    self._redisRead(pendingRead.n, pendingRead.cb);
  });
  this.pendingReads.length = 0; // truncate
};

RedisReadStream.prototype._redisRead = function (n, cb) {
  var self = this;
  n = n || DEFAULT_REDIS_READ_SIZE;
  rc.getrange(this.redisKey, this.readBytes, this.readBytes + n - 1, function (err, buff) { // using buff key, so buff returned
    if (err) { self.emit('error', err); return; }
    self.readBytes += buff.length;
    cb(null, buff);
  });
};

RedisReadStream.prototype._read = function (n, cb) {
  if (!this.redisKey) return this.pendingReads.push({ n: n, cb: cb });
  this._redisRead(n, cb);
};


module.exports = RedisReadStream;