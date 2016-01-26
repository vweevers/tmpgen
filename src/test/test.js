const tmpgen = require('../')
    , test = require('tape')
    , existent = require('existent')
    , isPathInside = require('is-path-inside')
    , TMP = require('osenv').tmpdir()
    , unixify = require('unixify')
    , ts = require('monotonic-timestamp')
    , rimraf = require('rimraf')
    , mkdirp = require('mkdirp')

const { join, basename, relative, dirname } = require('path')

function expect(t, actual, expected, msg) {
  t.is(unixify(actual), unixify(expected), msg || debug(expected))
  t.ok(existent.sync(actual), 'exists: ' + debug(expected))
}

function genspy(mixed, cb) {
  const gen = tmpgen.generator(mixed)

  return function spy() {
    const val = gen()
    spy.last = val
    if (cb) cb(val)
    return val
  }
}

function debug(path, root = TMP) {
  if (isPathInside(path, root)) path = relative(root, path)
  else if (isPathInside(path, unixify(root))) path = relative(unixify(root), path)
  return unixify(path)
}

function del(t, tmp, ...paths) {
  while (Array.isArray(paths[0])) paths.unshift(...paths.shift())

  paths = paths.concat(tmp.ctx.created)
  paths = paths.filter((p,i) => paths.lastIndexOf(p) === i)

  t.ok(paths.length > 0, 'has paths')

  const nonExistent = paths.filter(p => !existent.sync(p))
  t.is(nonExistent.length, 0, 'paths exist prior to del')

  if (nonExistent.length > 0) {
    t.fail('do not exist: ' + nonExistent.join(', '))
  }

  tmp.del()

  const remaining = paths.filter(p => existent.sync(p))
  t.is(remaining.length, 0, 'paths deleted after del')

  if (remaining.length > 0) {
    t.fail('failed to delete: ' + remaining.join(', '))
  }
}

test('basic', (t) => {
  const tmp = tmpgen('tmpgen-test-basic-*', { gen: genspy() })

  const p1 = tmp(), name1 = ''+tmp.gen.last
      , p2 = tmp(), name2 = ''+tmp.gen.last

  t.is(typeof p1, 'string', 'returns string')
  t.is(typeof p2, 'string', 'returns string')

  t.ok(p1 !== p2, 'two unique dirs')
  t.ok(isPathInside(p1, TMP), 'is inside tmp')
  t.ok(isPathInside(p2, TMP), 'is inside tmp')

  expect(t, p1, join(TMP, 'tmpgen-test-basic-'+name1))
  expect(t, p2, join(TMP, 'tmpgen-test-basic-'+name2))

  del(t, tmp, p1, p2)
  t.end()
})

test('only last wildcard is dynamic', (t) => {
  let genvar = 'x'

  const gen = () => genvar
  const tmp = tmpgen('tmpgen-test-dynamic/*/*', { gen })
  const dir = join(TMP, 'tmpgen-test-dynamic')

  const p1 = tmp()
      , p2 = tmp()

  t.ok(p1 !== p2, 'two unique dirs')

  t.ok(isPathInside(p1, dir), 'is inside tmp')
  t.ok(isPathInside(p2, dir), 'is inside tmp')

  expect(t, p1, join(dir, 'x/x'))
  expect(t, p2, join(dir, 'x/xx'))
  expect(t, tmp(), join(dir, 'x/xxx'))

  genvar = 'y'
  expect(t, tmp(), join(dir, 'x/y'))
  expect(t, tmp(), join(dir, 'x/yy'))

  del(t, tmp, p1, p2)
  t.end()
})

test('subdir', (t) => {
  const tmp = tmpgen('tmpgen-test-subdir/*')

  const p1 = tmp()
      , p2 = tmp()

  t.is(typeof p1, 'string', 'returns string')
  t.is(typeof p2, 'string', 'returns string')

  t.ok(p1 !== p2, 'two unique dirs')

  t.ok(existent.sync([p1, p2]), 'created dirs')
  t.ok(isPathInside(p1, join(TMP, 'tmpgen-test-subdir')), 'is inside tmp')
  t.ok(isPathInside(p2, join(TMP, 'tmpgen-test-subdir')), 'is inside tmp')

  del(t, tmp, p1, p2)
  t.end()
})

test('many dirs', (t) => {
  const tmp1 = tmpgen('tmpgen-test-many1/*'), paths1 = []
  const tmp2 = tmpgen('tmpgen-test-many2/*', { gen: 'hat' }), paths2 = []

  for(let i=0, prev; i<20; i++) {
    const p = tmp1()
    t.ok(existent.sync(p), debug(p))
    if (i>0) t.isNot(p, prev, 'unique')
    prev = p
    paths1.push(p)
  }

  for(let i=0, prev; i<20; i++) {
    const p = tmp2()
    t.ok(existent.sync(p), debug(p))
    if (i>0) t.isNot(p, prev, 'unique')
    prev = p
    paths2.push(p)
  }

  del(t, tmp1, paths1)
  del(t, tmp2, paths2)

  t.end()
})

test('resolves paths', (t) => {
  const tmp = tmpgen('tmpgen-test-resolve/foo/../foo-*/../bar-*', { gen: genspy() })
  expect(t, tmp(), join(TMP, 'tmpgen-test-resolve/bar-'+tmp.gen.last))
  del(t, tmp)
  t.end()
})

test('spec must be a string', (t) => {
  t.throws(tmpgen.bind(null, 282))
  t.end()
})

test('custom root', (t) => {
  const root = join(TMP, 'tmpgen-test-custom-root')
  rimraf.sync(root) // In case test failed previously

  const tmp = tmpgen('hello', { root })
  expect(t, tmp(), join(root, 'hello'))

  del(t, tmp, join(root, 'hello'))
  t.ok(existent.sync(root), 'root is not deleted')

  rimraf.sync(root)
  t.end()
})

test('generator function', (t) => {
  t.throws(tmpgen.bind(null, { gen: '' }), 'may not be empty')
  t.throws(tmpgen.bind(null, { gen: 'nope' }), 'string must be a known alias')

  t.is(tmpgen({ gen: 'ts' }).gen, tmpgen({ gen: 'timestamp' }).gen, 'ts or timestamp')
  t.is(tmpgen().gen, tmpgen({ gen: 'ts' }).gen, 'defaults to timestamp')
  t.is(tmpgen({ gen: null }).gen, ts, 'defaults to timestamp')
  t.is(tmpgen({ gen: 'hat' }).gen, tmpgen({ gen: 'random' }).gen, 'hat or random')
  t.isNot(tmpgen({ gen: 'ts' }).gen, tmpgen({ gen: 'hat' }).gen, 'ts is not hat')

  t.throws(tmpgen({ gen: () => {} }), 'generator must generate name')
  t.throws(tmpgen({ gen: () => '' }), 'that is not empty')
  t.throws(tmpgen({ gen: () => true }), 'and a string or number name')
  t.throws(tmpgen({ gen: () => '*' }), 'without wildcards')
  t.throws(tmpgen({ gen: () => '/' }), 'or other unsafe characters')

  t.end()
})

test('throws if no wildcard and dir exists', (t) => {
  const tmp1 = tmpgen('tmpgen-test-no-wildcard/*')
      , p1 = tmp1()
      , name = basename(p1)

  t.ok(existent.sync(p1), debug(p1))

  const tmp2 = tmpgen('tmpgen-test-no-wildcard/'+name)
  t.throws(tmp2)

  del(t, tmp1)
  t.end()
})

// TODO: test with a fake package
test('defaults to module-name/*', (t) => {
  const tmp = tmpgen({ gen: genspy() })
  expect(t, tmp(), join(TMP, 'tmpgen', ''+tmp.gen.last))
  del(t, tmp)
  t.end()
})

test('cannot go outside root', (t) => {
  t.throws(tmpgen.bind(null, '..'))
  t.throws(tmpgen.bind(null, 'foo/../..'))
  t.throws(tmpgen.bind(null, '/home'))
  t.throws(tmpgen.bind(null, '.'))
  t.throws(tmpgen.bind(null, 'foo/../.'))
  t.throws(tmpgen.bind(null, './foo/../.'))
  t.end()
})

test('sub factory', (t) => {
  const tmp = tmpgen('tmpgen/sub/*', { gen: genspy('hat') })
  const p1 = tmp()

  expect(t, p1, join(TMP, 'tmpgen/sub', tmp.gen.last))

  t.throws(tmp.sub.bind(tmp), 'spec for sub may not be empty')
  t.throws(tmp.sub.bind(tmp, ''), 'spec for sub may not be empty')

  let sub = tmp.sub('s/*')
  t.is(sub.gen, tmp.gen, 'inherits generator')

  sub = tmp.sub('s/*', { gen: genspy('alpha') })
  t.isNot(sub.gen, tmp.gen, 'can have own generator')

  const parent = (p) => unixify(dirname(dirname(p)))

  const sub1 = sub()
  t.isNot(unixify(p1), parent(sub1), 'not ' + debug(p1))
  expect(t, sub1, join(TMP, 'tmpgen/sub', tmp.gen.last, 's', ''+sub.gen.last))

  const sub2 = sub()
  t.isNot(unixify(p1), parent(sub2), 'not ' + debug(p1))
  t.isNot(sub1, sub2, 'unique')
  t.is(parent(sub1), parent(sub2), 'share parent: ' + debug(parent(sub1)))
  expect(t, sub2, join(TMP, 'tmpgen/sub', tmp.gen.last, 's', ''+sub.gen.last))

  del(t, tmp, p1, sub1, sub2)
  t.end()
})

test('factory takes additional path', (t) => {
  const tmp = tmpgen('tmpgen-additional-path/*', { gen: genspy('hat') })
  const dir = join(TMP, 'tmpgen-additional-path')

  expect(t, tmp(), join(dir, tmp.gen.last))
  expect(t, tmp('beep'), join(dir, tmp.gen.last, 'beep'))
  expect(t, tmp('beep', 'boop'), join(dir, tmp.gen.last, 'beep', 'boop'))
  expect(t, tmp('beep/boop'), join(dir, tmp.gen.last, 'beep', 'boop'))

  t.throws(tmp.bind(null, '..'), 'cannot go outside of dir')
  t.throws(tmp.bind(null, 'a', '..', 'b', '..'), 'cannot be equal to dir')

  del(t, tmp)
  t.end()
})

test('del throws if dir was not created by factory', (t) => {
  rimraf.sync(join(TMP, 'tmpgen-del-own'))

  const tmp = tmpgen('tmpgen-del-own/*')

  t.throws(tmp.del.bind(tmp, '/home/tmpgen-test'))
  t.throws(tmp.del.bind(tmp, 'boop'))
  t.throws(tmp.del.bind(tmp, TMP))
  t.throws(tmp.del.bind(tmp, join(TMP, 'tmpgen-del-own')))

  const p1 = tmp()

  t.ok(existent.sync(p1), 'has ' + debug(p1))
  tmp.del(p1)
  t.notOk(existent.sync(p1), 'deleted ' + debug(p1))

  // Should still have a path (the parent dir of p1, "tmpgen-del-own")
  del(t, tmp)

  t.end()
})

test('deletes subfolder of created dir', (t) => {
  const tmp = tmpgen('tmpgen-del-subfolder/*')
      , p1 = tmp()
      , sub = join(p1, 'sub')

  mkdirp.sync(sub)

  try {
    tmp.del('sub', true)
  } catch(err) {
    t.fail(err)
  }

  t.notOk(existent.sync(sub), 'deleted (1) ' + debug(sub))

  try {
    tmp.del(sub, true)
  } catch(err) {
    t.fail(err)
  }

  t.notOk(existent.sync(sub), 'deleted (2) ' + debug(sub))

  t.throws(tmp.del.bind(tmp, '..'), 'may not be outside of dir')

  // Should not throw
  tmp.del(join(p1, 'beep'))

  // Should still have a path (p1)
  del(t, tmp)

  t.end()
})

test('repeats names', (t) => {
  const tmp1 = tmpgen('tmpgen-test-repeat-*', { gen: 'alpha' })

  expect(t, tmp1(), join(TMP, 'tmpgen-test-repeat-a'))
  expect(t, tmp1(), join(TMP, 'tmpgen-test-repeat-b'))

  const tmp2 = tmpgen('tmpgen-test-repeat-*', { gen: 'alpha' })

  // repeat is the wrong word, maybe
  expect(t, tmp2(), join(TMP, 'tmpgen-test-repeat-cd'))
  expect(t, tmp2(), join(TMP, 'tmpgen-test-repeat-e'))

  del(t, tmp1)
  del(t, tmp2)

  t.end()
})
