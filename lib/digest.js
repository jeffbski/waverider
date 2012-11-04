'use strict';

/*
 * Calculate digest for string or stream
 */

var crypto = require('crypto');

/**
 * calculate sha1 digest or create digester
 * @param data if defined, calculate sha1
 * @param outputType optional string 'base64, 'hex', 'binary', defaults to 'base64'
 * @return digest output if data was provided, otherwise return digester
 */
function digest(data, outputType) {
  var shasum = crypto.createHash('sha1');
  if (typeof data === 'undefined') return shasum; //digester for use with streams
  outputType = outputType || 'base64';
  shasum.update(data);
  return shasum.digest(outputType);
}

module.exports = digest;