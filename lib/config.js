'use strict';

var config = {
  expireSecs: 60 * 60, // one hour
  expireTypesExcluded: ['text/html'],
  revisions: 5
};

module.exports = config;