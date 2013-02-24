'use strict';

/*
 * content model
 *
 * incoming key should be <host>:<urlpath>
 *
 * For each save, get new contentId using incr of id: content
 *
 * set content in cont:<contentId>:
 * set meta in meta:<contentId>:
 *
 * For real content
 *   lpush (shift) url:<host>:<urlpath>: contentId
 *
 * For source content (like markdown)
 *   lpush (shift) srcurl:<host>:<urlpath>: contentId
 */

var react = require('react');
var accum = require('accum');
var passStream = require('pass-stream');
var digestStream = require('digest-stream');
var lengthStream = require('length-stream');
var redisRStream = require('redis-rstream');
var redisWStream = require('redis-wstream');

var util = require('util');
var zlib = require('zlib');
var rc = require('./redis-client');
var sourceRenderer = require('./source-renderer');

// content_id_counter = hget id: content
var ID_COUNTER_NS = 'id:';
var CONTENT_ID_FIELD = 'content';

// cont:<contentId>
// meta:<contentId>
var CONTENT_NS = 'cont:';
var META_NS = 'meta:';

// meta fields
var TYPE = 'type';
var LEN = 'len';
var DIGEST = 'digest';
var MOD_TIME = 'mtime';
var RESERVED_META_FIELDS = [ TYPE, LEN, DIGEST, MOD_TIME, 'Content-Encoding', 'preprocess' ];

// key will be <host>:<urlpath>
// url:<host>:<urlpath> list to revisions (left is most recent)
// srcurl:<host>:<urlpath> list to src revisions (left is most recent)
var URL_NS = 'url:';
var SRC_URL_NS = 'srcurl:';

var FILTER_META_KEYS = ['preprocess']; // filter out these keys before giving meta data back

var content = { }; // main object that is module.exports
content.currentConfig = {}; // default config

/**
  getter / setter for config
  */
function config(newConfig) {
  if (!newConfig) return content.currentConfig;
  content.currentConfig = newConfig;
}

/**
 * calc content key from host and path
 */
function ckey(host, path) {
  return host + ':' + path;
}


function getNextContentId(cb) { // this should go into lua to run at server
  rc.hincrby(ID_COUNTER_NS, CONTENT_ID_FIELD, 1, cb);
}

function cns(contentId) {
  return CONTENT_NS + contentId;
}

function mns(contentId) {
  return META_NS + contentId;
}

function urlns(key) {
  return URL_NS + key;
}

function srcns(key) {
  return SRC_URL_NS + key;
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

/**
 * save data into redis, can pass data as string or stream.
 * @param key string host:urlpath
 * @param data string or stream
 * @param type string content type - saved as meta data `type` - required
 * @param meta optional object with additional meta data (`type`, `len` and `digest` will be overriden with actual values)
 * @param cb function callback(err, digest, gzipLength, cid)
 */
function set(key, data, type, meta, cb) {
  if (typeof cb === 'undefined' && typeof meta === 'function') { // meta not provided
    cb = meta;
    meta = null;
  }
  if (!data.on) { // is not a stream, but a string, so create one
    var dataString = data;
    data = passStream();
    data.pause();
    data.end(dataString);
    process.nextTick(function () { data.resume(); });
  }
  setStream(key, data, type, meta, cb);
}

/**
 * digest, gzip, and store
 */
function setStream(key, inStream, type, meta, cb) {
  meta = meta || {};
  var pstream = passStream(); // pausable stream
  pstream.pause();
  inStream
    .pipe(pstream);

  // create clone so we are not modifying original
  var metaObj = Object.keys(meta).reduce(function (accum, k) { accum[k] = meta[k]; return accum; }, {});

  getNextContentId(function (err, contentId) {
    if (err) return cb(err);

    var digest;
    function digestFn(resultDigest, len) {
      digest = resultDigest;
    }

    var length;
    function lengthFn(len) {
      length = len;
    }

    pstream
      .pipe(digestStream('sha1', 'base64', digestFn))
      .pipe(zlib.createGzip())
      .pipe(lengthStream(lengthFn))
      .pipe(redisWStream(rc, cns(contentId)))
      .on('error', function (err) { cb(err); })
      .on('end', function () {
        metaObj[TYPE] = type;
        metaObj[LEN] = length.toString();
        metaObj[DIGEST] = digest;
        metaObj[MOD_TIME] = metaObj[MOD_TIME] || (new Date()).toISOString();
        metaObj['Content-Encoding'] = 'gzip';
        rc.multi()
          .hmset(mns(contentId), metaObj)
          .lpush(urlns(key), contentId)
          .exec(function (err, result) {
            if (err) return cb(err);
            purgeVersions(key, content.currentConfig.revisions, function (err, result) {
              if (err) console.error('Error purging versions for key: %s, err:', key, err); // log and cont
              cb(null, digest, length, contentId);
            });
          });
      });
    pstream.resume();
  });
}

function purgeVersions(key, revisionsToKeep, cb) {
  if (!revisionsToKeep || revisionsToKeep < 1) return cb(); // < 1, keep all versions
  rc.watch(urlns(key));
  rc.lrange(urlns(key), revisionsToKeep, -1, function (err, cidsToPurge) {
    if (err) { rc.unwatch(); return cb(err); }
    var rcWorking = cidsToPurge.reduceRight(function (rcWorking, cid) {
      rcWorking = rcWorking
                    .rpop(urlns(key))
                    .del(cns(cid))
                    .del(mns(cid));
      return rcWorking;
    }, rc.multi());
    rcWorking.exec(cb);
  });
}


function wrapHTMLFragment(fragment) {
  return '<html><body>' + fragment + '</body></html';
}

/**
 * save source like markdown, render html, save html
 */
function setFromSource(key, data, type, meta, cb) {
  var rendered = sourceRenderer(data, type);
  meta.sourceType = type;
  if (meta.wrapHTMLFragment) {
    rendered = wrapHTMLFragment(rendered);
  } else {
    meta.htmlType = 'fragment';
  }
  set(key, rendered, 'text/html', meta, cb);
}

function updateMetaForSource(meta, srcKey, srcId) {
  meta.srcKey = srcKey;
  meta.srcId = srcId;
  return meta;
}

/**
 * get source from srcKey, render, save to dstKey
 */
var setFromSourceKey = react('setFromSourceKey', 'dstKey, srcKey, cb -> err, digest, length',
  getContentIdForKey, 'srcKey, cb -> err, srcId',
  getMeta, 'srcKey, cb -> err, meta',
  getData, 'srcKey, cb -> err, data',
  updateMetaForSource, 'meta, srcKey, srcId -> metaDst',
  setFromSource, 'dstKey, data, metaDst.type, metaDst, cb -> err, digest, length'
);

function getContentIdForKey(keyOrCid, cb) {
  if (keyOrCid.indexOf('/') === -1) return cb(null, keyOrCid); // no /, keyOrCid is cid
  rc.lindex(urlns(keyOrCid), 0, cb);
}

function getAllVersions(key, options, cb) {
  rc.lrange(urlns(key), 0, -1, cb);
}

/**
 * get uncompressed data as a Buffer
 */
function getData(key, cb) {
  var stream = getDataStream(key);
  stream
    .pipe(zlib.createGunzip())
    .pipe(accum.buffer(function (alldata) {
      cb(null, alldata);
    }));
}

/**
 * returns gzipped data read stream
 */
function getDataStream(key) {
  var ps = passStream();
  getContentIdForKey(key, function (err, cid) {
    if (err) return ps.emit('error', err);
    redisRStream(rc, cns(cid))
      .pipe(ps);
  });
  return ps;
}

function getMeta(key, cb) {
  getContentIdForKey(key, function (err, cid) {
    if (err) return cb(err);
    rc.hgetall(mns(cid), function (err, meta) {
      if (err) return cb(err);
      if (!meta) return cb(null, meta); // not found
      if (meta[MOD_TIME]) meta[MOD_TIME] = new Date(Date.parse(meta[MOD_TIME])); // convert to Date from ISO
      var resultMeta = Object.keys(meta).reduce(function (accum, k) {
        if (FILTER_META_KEYS.indexOf(k) === -1) accum[k] = meta[k]; // not in filter list include it
        return accum;
      }, {});
      cb(null, resultMeta);
    });
  });
}

function del(key, cb) {
  rc.lrange(urlns(key), 0, -1, function (err, cids) {
    if (err) return cb(err);
    cids.forEach(function (cid) { // TODO check for errors
      rc.del(cns(cid));
      rc.del(mns(cid));
    });
    rc.del(urlns(key), cb);
  });
}

content.ckey = ckey;
content.config = config;
content.del = del;
content.getAllVersions = getAllVersions;
content.getData = getData;
content.getDataStream = getDataStream;
content.getMeta = getMeta;
content.set = set;
content.setFromSource = setFromSource;
content.setFromSourceKey = setFromSourceKey;
content.RESERVED_META_FIELDS = RESERVED_META_FIELDS;
module.exports = content;