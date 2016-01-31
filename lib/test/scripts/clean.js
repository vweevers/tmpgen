'use strict';

var tmpgen = require('../..');
var tmp = tmpgen('tmpgen-test-exit-*/*', { clean: true });

console.log(tmp());
console.log(tmp());