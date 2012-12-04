'use strict';

var marked = require('marked');

marked.setOptions({
  gfm: true,
  pedantic: false,
  sanitize: true,
  // callback for code highlighter
  // highlight: function(code, lang) {
  //   if (lang === 'js') {
  //     return javascriptHighlighter(code);
  //   }
  //   return code;
  // }
});


var RENDERERS = {
  markdown: marked
};



function sourceRenderer(source, type) {
  if (Buffer.isBuffer(source)) source = source.toString();
  function matchRenderer(accum, key) {
    if (accum) return accum; // already matched return it
    if (type.indexOf(key) !== -1) return RENDERERS[key];
  }
  var renderer = Object.keys(RENDERERS).reduce(matchRenderer, null);
  if (!renderer) throw new Error('renderer not found for ' + type);
  return renderer(source);
}


module.exports = sourceRenderer;