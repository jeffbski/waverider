'use strict';

/*
 * Calculate digest for string or stream
 */

var crypto = require('crypto');

function digest(data) {
  var shasum = crypto.createHash('sha1');
  shasum.update(data);
  return shasum.digest('base64'); // might want to use binary normally
}

module.exports = digest;