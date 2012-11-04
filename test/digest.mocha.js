'use strict';

var chai = require('chai-stack');
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