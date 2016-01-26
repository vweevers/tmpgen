'use strict';

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i]; return arr2; } else { return Array.from(arr); } }

var tmpgen = require('../'),
    test = require('tape'),
    existent = require('existent'),
    isPathInside = require('is-path-inside'),
    TMP = require('osenv').tmpdir(),
    unixify = require('unixify'),
    ts = require('monotonic-timestamp'),
    rimraf = require('rimraf'),
    mkdirp = require('mkdirp');

var _require = require('path');

var join = _require.join;
var basename = _require.basename;
var relative = _require.relative;
var dirname = _require.dirname;

function expect(t, actual, expected, msg) {
  t.is(unixify(actual), unixify(expected), msg || debug(expected));
  t.ok(existent.sync(actual), 'exists: ' + debug(expected));
}

function genspy(mixed, cb) {
  var gen = tmpgen.generator(mixed);

  return function spy() {
    var val = gen();
    spy.last = val;
    if (cb) cb(val);
    return val;
  };
}

function debug(path) {
  var root = arguments.length <= 1 || arguments[1] === undefined ? TMP : arguments[1];

  if (isPathInside(path, root)) path = relative(root, path);else if (isPathInside(path, unixify(root))) path = relative(unixify(root), path);
  return unixify(path);
}

function del(t, tmp) {
  for (var _len = arguments.length, paths = Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
    paths[_key - 2] = arguments[_key];
  }

  while (Array.isArray(paths[0])) {
    var _paths;

    (_paths = paths).unshift.apply(_paths, _toConsumableArray(paths.shift()));
  }paths = paths.concat(tmp.ctx.paths);
  paths = paths.filter(function (p, i) {
    return paths.lastIndexOf(p) === i;
  });

  t.ok(paths.length > 0, 'has paths');
  t.ok(existent.sync(paths), 'paths exist prior to del');

  tmp.del();

  var remaining = paths.filter(function (p) {
    return existent.sync(p);
  });
  t.is(remaining.length, 0, 'paths deleted after del');
}

test('basic', function (t) {
  var tmp = tmpgen('*', { gen: genspy() });

  var p1 = tmp(),
      name1 = '' + tmp.gen.last,
      p2 = tmp(),
      name2 = '' + tmp.gen.last;

  t.is(typeof p1, 'string', 'returns string');
  t.is(typeof p2, 'string', 'returns string');

  t.ok(p1 !== p2, 'two unique dirs');
  t.ok(isPathInside(p1, TMP), 'is inside tmp');
  t.ok(isPathInside(p2, TMP), 'is inside tmp');

  expect(t, p1, join(TMP, name1));
  expect(t, p2, join(TMP, name2));

  del(t, tmp, p1, p2);
  t.end();
});

test('only last wildcard is dynamic', function (t) {
  var genvar = 'x';

  var gen = function gen() {
    return genvar;
  };
  var tmp = tmpgen('tmpgen-test/*/*', { gen: gen });

  var p1 = tmp(),
      p2 = tmp();

  t.ok(p1 !== p2, 'two unique dirs');

  t.ok(isPathInside(p1, join(TMP, 'tmpgen-test')), 'is inside tmp');
  t.ok(isPathInside(p2, join(TMP, 'tmpgen-test')), 'is inside tmp');

  expect(t, p1, join(TMP, 'tmpgen-test/x/x'));
  expect(t, p2, join(TMP, 'tmpgen-test/x/xx'));
  expect(t, tmp(), join(TMP, 'tmpgen-test/x/xxx'));

  genvar = 'y';
  expect(t, tmp(), join(TMP, 'tmpgen-test/x/y'));
  expect(t, tmp(), join(TMP, 'tmpgen-test/x/yy'));

  del(t, tmp, p1, p2);
  t.end();
});

test('subdir', function (t) {
  var tmp = tmpgen('tmpgen-test/*');

  var p1 = tmp(),
      p2 = tmp();

  t.is(typeof p1, 'string', 'returns string');
  t.is(typeof p2, 'string', 'returns string');

  t.ok(p1 !== p2, 'two unique dirs');

  t.ok(existent.sync([p1, p2]), 'created dirs');
  t.ok(isPathInside(p1, join(TMP, 'tmpgen-test')), 'is inside tmp');
  t.ok(isPathInside(p2, join(TMP, 'tmpgen-test')), 'is inside tmp');

  del(t, tmp, p1, p2);
  t.end();
});

test('many dirs', function (t) {
  var tmp1 = tmpgen(),
      paths1 = [];
  var tmp2 = tmpgen({ gen: 'hat' }),
      paths2 = [];

  for (var i = 0, prev = undefined; i < 20; i++) {
    var p = tmp1();
    t.ok(existent.sync(p), debug(p));
    if (i > 0) t.isNot(p, prev, 'unique');
    prev = p;
    paths1.push(p);
  }

  for (var i = 0, prev = undefined; i < 20; i++) {
    var p = tmp2();
    t.ok(existent.sync(p), debug(p));
    if (i > 0) t.isNot(p, prev, 'unique');
    prev = p;
    paths2.push(p);
  }

  del(t, tmp1, paths1);
  del(t, tmp2, paths2);

  t.end();
});

test('resolves paths', function (t) {
  var tmp = tmpgen('tmpgen-test/foo/../foo-*/../bar-*', { gen: genspy() });
  expect(t, tmp(), join(TMP, 'tmpgen-test/bar-' + tmp.gen.last));
  del(t, tmp);
  t.end();
});

test('spec must be a string', function (t) {
  t.throws(tmpgen.bind(null, 282));
  t.end();
});

test('custom root', function (t) {
  var root = join(TMP, 'tmpgen-test-custom-root');
  rimraf.sync(root); // In case test failed previously

  var tmp = tmpgen('hello', { root: root });
  expect(t, tmp(), join(root, 'hello'));

  del(t, tmp, join(root, 'hello'));
  t.ok(existent.sync(root), 'root is not deleted');

  rimraf.sync(root);
  t.end();
});

test('generator function', function (t) {
  t.throws(tmpgen.bind(null, { gen: '' }), 'may not be empty');
  t.throws(tmpgen.bind(null, { gen: 'nope' }), 'string must be a known alias');

  t.is(tmpgen({ gen: 'ts' }).gen, tmpgen({ gen: 'timestamp' }).gen, 'ts or timestamp');
  t.is(tmpgen().gen, tmpgen({ gen: 'ts' }).gen, 'defaults to timestamp');
  t.is(tmpgen({ gen: null }).gen, ts, 'defaults to timestamp');
  t.is(tmpgen({ gen: 'hat' }).gen, tmpgen({ gen: 'random' }).gen, 'hat or random');
  t.isNot(tmpgen({ gen: 'ts' }).gen, tmpgen({ gen: 'hat' }).gen, 'ts is not hat');

  t.throws(tmpgen({ gen: function gen() {} }), 'generator must generate name');
  t.throws(tmpgen({ gen: function gen() {
      return '';
    } }), 'that is not empty');
  t.throws(tmpgen({ gen: function gen() {
      return true;
    } }), 'and a string or number name');
  t.throws(tmpgen({ gen: function gen() {
      return '*';
    } }), 'without wildcards');
  t.throws(tmpgen({ gen: function gen() {
      return '/';
    } }), 'or other unsafe characters');

  t.end();
});

test('throws if no wildcard and dir exists', function (t) {
  var tmp1 = tmpgen('tmpgen-test/*'),
      p1 = tmp1(),
      name = basename(p1);

  t.ok(existent.sync(p1), debug(p1));

  var tmp2 = tmpgen('tmpgen-test/' + name);
  t.throws(tmp2);

  del(t, tmp1);
  t.end();
});

// TODO: test with a fake package
test('defaults to module-name/*', function (t) {
  var tmp = tmpgen({ gen: genspy() });
  expect(t, tmp(), join(TMP, 'tmpgen', '' + tmp.gen.last));
  del(t, tmp);
  t.end();
});

test('cannot go outside root', function (t) {
  t.throws(tmpgen.bind(null, '..'));
  t.throws(tmpgen.bind(null, 'foo/../..'));
  t.throws(tmpgen.bind(null, '/home'));
  t.throws(tmpgen.bind(null, '.'));
  t.throws(tmpgen.bind(null, 'foo/../.'));
  t.throws(tmpgen.bind(null, './foo/../.'));
  t.end();
});

test('sub factory', function (t) {
  var tmp = tmpgen('tmpgen/sub/*', { gen: genspy('hat') });
  var p1 = tmp();

  expect(t, p1, join(TMP, 'tmpgen/sub', tmp.gen.last));

  t.throws(tmp.sub.bind(tmp), 'spec for sub may not be empty');
  t.throws(tmp.sub.bind(tmp, ''), 'spec for sub may not be empty');

  var sub = tmp.sub('s/*');
  t.is(sub.gen, tmp.gen, 'inherits generator');

  sub = tmp.sub('s/*', { gen: genspy('alpha') });
  t.isNot(sub.gen, tmp.gen, 'can have own generator');

  var parent = function parent(p) {
    return unixify(dirname(dirname(p)));
  };

  var sub1 = sub();
  t.isNot(unixify(p1), parent(sub1), 'not ' + debug(p1));
  expect(t, sub1, join(TMP, 'tmpgen/sub', tmp.gen.last, 's', '' + sub.gen.last));

  var sub2 = sub();
  t.isNot(unixify(p1), parent(sub2), 'not ' + debug(p1));
  t.isNot(sub1, sub2, 'unique');
  t.is(parent(sub1), parent(sub2), 'share parent: ' + debug(parent(sub1)));
  expect(t, sub2, join(TMP, 'tmpgen/sub', tmp.gen.last, 's', '' + sub.gen.last));

  del(t, tmp, p1, sub1, sub2);
  t.end();
});

test('factory takes additional path', function (t) {
  var tmp = tmpgen({ gen: genspy('hat') });

  expect(t, tmp(), join(TMP, 'tmpgen', tmp.gen.last));
  expect(t, tmp('beep'), join(TMP, 'tmpgen', tmp.gen.last, 'beep'));
  expect(t, tmp('beep', 'boop'), join(TMP, 'tmpgen', tmp.gen.last, 'beep', 'boop'));
  expect(t, tmp('beep/boop'), join(TMP, 'tmpgen', tmp.gen.last, 'beep', 'boop'));

  t.throws(tmp.bind(null, '..'), 'cannot go outside of dir');
  t.throws(tmp.bind(null, 'a', '..', 'b', '..'), 'cannot be equal to dir');

  del(t, tmp);
  t.end();
});

test('del throws if dir was not created by factory', function (t) {
  rimraf.sync(join(TMP, 'tmpgen-del-own'));

  var tmp = tmpgen('tmpgen-del-own/*');

  t.throws(tmp.del.bind(tmp, '/home/tmpgen-test'));
  t.throws(tmp.del.bind(tmp, 'boop'));
  t.throws(tmp.del.bind(tmp, TMP));
  t.throws(tmp.del.bind(tmp, join(TMP, 'tmpgen-del-own')));

  var p1 = tmp();

  t.ok(existent.sync(p1), 'has ' + debug(p1));
  tmp.del(p1);
  t.notOk(existent.sync(p1), 'deleted ' + debug(p1));

  // Should still have a path (the parent dir of p1, "tmpgen-del-own")
  del(t, tmp);

  t.end();
});

test('deletes subfolder of created dir', function (t) {
  var tmp = tmpgen(),
      p1 = tmp(),
      sub = join(p1, 'sub');

  mkdirp.sync(sub);
  tmp.del('sub');
  t.notOk(existent.sync(sub), 'deleted ' + debug(sub));

  t.throws(tmp.del.bind(tmp, '..'), 'may not be outside of dir');

  // Should not throw
  tmp.del(join(p1, 'beep'));

  // Should still have a path (p1)
  del(t, tmp);

  t.end();
});

test('repeats names', function (t) {
  var tmp1 = tmpgen('tmpgen-test-repeat-*', { gen: 'alpha' });

  expect(t, tmp1(), join(TMP, 'tmpgen-test-repeat-a'));
  expect(t, tmp1(), join(TMP, 'tmpgen-test-repeat-b'));

  var tmp2 = tmpgen('tmpgen-test-repeat-*', { gen: 'alpha' });

  // repeat is the wrong word, maybe
  expect(t, tmp2(), join(TMP, 'tmpgen-test-repeat-cd'));
  expect(t, tmp2(), join(TMP, 'tmpgen-test-repeat-e'));

  del(t, tmp1);
  del(t, tmp2);

  t.end();
});