const tmpgen = require('../..')
const tmp = tmpgen('tmpgen-test-exit-code-*/*', { clean: true, always: true })

// Fix for Windows: wait for flush before exiting
process.stdout.write(tmp(), function flushed(){
  process.exit(293)
})
