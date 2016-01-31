const tmpgen = require('../..')
const tmp = tmpgen('tmpgen-test-exit-*/*', { clean: true })

console.log(tmp())
console.log(tmp())
