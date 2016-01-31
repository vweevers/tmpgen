const tmpgen = require('../..')
const tmp = tmpgen('tmpgen-test-exit-error-*/*', { clean: true, always: true })

console.log(tmp())

throw new Error('beep')
