"use strict";

const tmpgen = require('./')

// Create a factory, using the default generator
const tmp = tmpgen('a/*/b-*')

// /tmp/a/1453821919917/b-1453821919918
console.log(tmp())

// /tmp/a/1453821919917/b-1453821919921
console.log(tmp())

// Create a sub-factory, using node-hat as generator.
const sub = tmp.sub('beep-*', { gen: 'hat' })

// /tmp/a/1453821919917/b-1453821919923/beep-eae732..
console.log(sub())

// /tmp/a/1453821919917/b-1453821919923/beep-881ce2..
console.log(sub())

// Recursively delete every directory created by `sub`
sub.del()

// Create another directory
const p1 = sub()

// Append (and create) a path
const p2 = sub('even/deeper')

console.log(p1)
console.log(p2)

// Delete specific directories
sub.del(p1)
sub.del(p2)

// Throws, because `sub` did not create this path or an ancestor
try {
  sub.del('/home')
} catch(err) {
  console.error(err.message)
}

// Delete every directory created by `tmp` and `sub`
tmp.del()
