'use strict';

/*
 * Launch strata web server
 */


var strata = require('strata');
strata.run(function (env, cb) {
  cb(200, {}, 'Hello World');
});