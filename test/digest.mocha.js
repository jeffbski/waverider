'use strict';

var chai = require('chai-stack');
var fs = require('fs');
var path = require('path');
var digest = require('../lib/digest');
var t = chai.assert;

suite('digest');

test('digest(data) returns digest', function () {
  var str = "ajdklfjdlafjlds3232";
  var d1 = digest(str);
  var d2 = digest(str);
  t.equal(d1, d2, 'same str should have same digest');
  var d3 = digest(str + 'z');
  t.notEqual(d1, d3, 'different str should have diff digest');
});

test('digest() returns digester', function () {
  var digester = digest();
  t.isFunction(digester.update);
  t.isFunction(digester.digest);
});

test('digester.update(data) and digester.digest(type) matches shasum unix command', function (done) {
  var expectedSha1 = '648a6a6ffffdaa0badb23b8baf90b6168dd16b3a';
  var digester = digest();
  var inStream = fs.createReadStream(path.join(__dirname, 'fixtures/hello.txt'));
  inStream.on('error', function (err) { done(err); });
  inStream.on('data', function (data) { digester.update(data); });
  inStream.on('end', function () {
    var dig = digester.digest('hex');
    t.equal(dig, expectedSha1, 'digest should match shasum unix calc');
    done();
  });
});

test('digest(data, "hex") matches that of shasum unix command', function (done) {
  var expectedSha1 = '648a6a6ffffdaa0badb23b8baf90b6168dd16b3a';
  fs.readFile(path.join(__dirname, 'fixtures/hello.txt'), function (err, data) {
    var dig = digest(data, 'hex');
    t.equal(dig, expectedSha1, 'digest should match shasum unix cal');
    done();
  });
});