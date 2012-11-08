'use strict';

/**
 * Central place that generates the redis client connection
 */

var redis = require('redis');
var rc = redis.createClient(null, null, { detect_buffers: true });

module.exports = rc;