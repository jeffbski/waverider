'use strict';

/**
  prepare the database with necessary structure

  This is safe to run repeatedly, since it just verifies that the
  necessary structure is there and if not then creates it.
  */

var redis = require('redis');
var crypto = require('crypto');
var digest = require('./digest');

var RANDOM_SERVERID = digest(crypto.randomBytes(256)).slice(0, 6); // 6 char serverid if db doesn't have one

var rc = redis.createClient();

function prepare(cb) {

  rc.multi()
    .hsetnx('namespaces:', 'cont:', 'str - content')
    .hsetnx('namespaces:', 'meta:', 'hash - meta data for content')
    .hsetnx('namespaces:', 'id:', 'hash - unique ID counter')
    .hsetnx('namespaces:', 'url:', 'list - revisions of contid or external URL')
    .hsetnx('namespaces:', 'srcurl:', 'list - revisions of contid used for rendering content')
    .hsetnx('namespaces:', 'server:', 'hash - server specific info like server id')
    .hsetnx('server:', 'id', RANDOM_SERVERID)
    .exec(cb);
}

module.exports = prepare;
