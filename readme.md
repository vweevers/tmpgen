# tmpgen

**Create unique nested temporary directories. Makes factories according to a path spec with wildcards. Each wildcard gets replaced with a generated name, by [monotonic-timestamp](https://github.com/dominictarr/monotonic-timestamp) (the default), [hat](https://github.com/substack/node-hat) or a custom generator. If this results in an existing path, the generator is called again, and if that doesn't work, `tmpgen` starts concatenating names. Has utilities to remove the created directories, but does not delete anything by default.**

[![npm status](http://img.shields.io/npm/v/tmpgen.svg?style=flat-square)](https://www.npmjs.org/package/tmpgen) [![Travis build status](https://img.shields.io/travis/vweevers/tmpgen.svg?style=flat-square&label=travis)](http://travis-ci.org/vweevers/tmpgen) [![AppVeyor build status](https://img.shields.io/appveyor/ci/vweevers/tmpgen.svg?style=flat-square&label=appveyor)](https://ci.appveyor.com/project/vweevers/tmpgen) [![Dependency status](https://img.shields.io/david/vweevers/tmpgen.svg?style=flat-square)](https://david-dm.org/vweevers/tmpgen)

## concrete example

```js
const levelup = require('levelup')
    , tmp = require('tmpgen')('my-awesome-module/*')

const db1 = levelup(tmp())
    , db2 = levelup(tmp())
```

## usage

The basic premise: create a factory with `tmpgen(spec)`, then call the factory to create a unique directory and get its path. Only the last wildcard in a spec is made to be unique each time.

```js
const tmpgen = require('tmpgen')

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

// Append (and create) an extra path
const p2 = sub('even/deeper')

// Delete specific directories
sub.del(p1)
sub.del(p2)

// Throws, because `sub` did not create this path or an ancestor
sub.del('/home')

// Delete every directory created by `tmp` and `sub`
tmp.del()
```

## api

### `factory = tmpgen([spec][, opts])`

- **spec**: must be a relative path. Defaults to "[module-name]/\*". If `spec` does not contain wildcards, and the path it resolves to already exists, the factory will throw an error.
- **opts.gen**: ["timestamp" or "ts"](https://github.com/dominictarr/monotonic-timestamp), ["hat" or "random"](https://github.com/substack/node-hat) or a function to be called without any arguments. These are equal:

```js
tmpgen({ gen: 'ts' })
tmpgen({ gen: require('monotonic-timestamp') })
```

- **opts.root**: where to mount directories. Defaults to [`osenv.tmpdir()`](https://github.com/npm/osenv#osenvtmpdir)
- **opts.clean**: call `factory.del()` on process exit, if the exit code is zero or **opts.always** is true. Essentially:

```js
// opts.clean
process.on('exit', (code) => code || tmp.del())

// opts.clean && opts.always
process.on('exit', () => tmp.del())
```

### `path = factory(...extra)`

Create a new directory. Any extra arguments are appended to the generated path and resolved. Throws if the resolved path is not inside the generated path:

```js
factory('foo/..', 'bar', '..')
```

### `factory = factory.sub(spec[, opts])`

Create a sub-factory, inheriting the options from its parent. Unless you specify `opts.root`, the sub will call its parent (once) to generate a root path. For sub-factories, `spec` is required.

### `factory.del([path])`

Recursively and synchronously delete a path. Throws if `path` (or an ancestor) was not created by the factory. If `path` is omitted, all previously created directories are deleted. Note that in the following example, the complete `/tmp/a` will be deleted if it did not exist before.

```js
const tmp = tmpgen('a/b/c/*')
const path = tmp()

tmp.del()
```

If you use a custom `root`, it will be created for you, but never deleted. In this example, `/home/beep/tmp-a` and `/home/beep/tmp-aa` are deleted at the end, but not `/home/beep`.

```js
const gen = () => 'a'
const tmp = tmpgen('tmp-*', { gen, root: '/home/beep' })
const path1 = tmp()
const path2 = tmp()

tmp.del()
```

## install

With [npm](https://npmjs.org) do:

```
npm install tmpgen
```

## license

[MIT](http://opensource.org/licenses/MIT) © Vincent Weevers
