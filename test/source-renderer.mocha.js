'use strict';

var chai = require('chai-stack');
var sourceRenderer = require('../lib/source-renderer');

var t = chai.assert;


suite('source-renderer');

test('sourceRenderer(markdownStr, "text/x-web-markdown") renders HTML - closest standard mime type', function () {
  var source = '# Hello';
  var expected = '<h1>Hello</h1>\n';
  var result = sourceRenderer(source, 'text/x-web-markdown');
  t.equal(result, expected);
});

test('sourceRenderer(markdownBuffer, "text/x-web-markdown") renders HTML - closest standard mime type', function () {
  var source = new Buffer('# Hello');
  var expected = '<h1>Hello</h1>\n';
  var result = sourceRenderer(source, 'text/x-web-markdown');
  t.equal(result, expected);
});


test('sourceRenderer(markdown, "text/markdown") renders HTML', function () {
  var source = '# Hello';
  var expected = '<h1>Hello</h1>\n';
  var result = sourceRenderer(source, 'text/markdown');
  t.equal(result, expected);
});

test('sourceRenderer(foo, "bad-type") throws renderer not found', function () {
  function renderThrows() {
    var result = sourceRenderer('foo', 'bad-type');
  }
  t.throws(renderThrows, /renderer not found for bad-type/);
});