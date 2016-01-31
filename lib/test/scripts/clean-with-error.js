'use strict';

var tmpgen = require('../..');
var tmp = tmpgen('tmpgen-test-exit-error-*/*', { clean: true, always: true });

// Fix for Windows: wait for flush before exiting
process.stdout.write(tmp(), function flushed() {
  throw new Error('beep');
});