const tmpgen = require('../..')
const tmp = tmpgen('tmpgen-test-exit-code-*/*', { clean: true, always: true })

console.log(tmp())

process.exit(293)
