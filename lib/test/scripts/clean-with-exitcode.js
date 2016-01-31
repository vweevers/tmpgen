'use strict';

var tmpgen = require('../..');
var tmp = tmpgen('tmpgen-test-exit-code-*/*', { clean: true, always: true });

console.log(tmp());

process.exit(293);