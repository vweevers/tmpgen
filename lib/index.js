'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i]; return arr2; } else { return Array.from(arr); } }

var kindOf = require('kindof'),
    unixify = require('unixify'),
    mkdirp = require('mkdirp'),
    isPathInside = require('is-path-inside'),
    packpath = require('packpath'),
    ts = require('monotonic-timestamp'),
    hat = require('hat').rack(),
    rimraf = require('rimraf'),
    isAbsolute = require('is-absolute');

var _require = require('path');

var resolve = _require.resolve;
var sep = _require.sep;
var relative = _require.relative;
var join = _require.join;

var TMP = require('osenv').tmpdir();
var ALLOWED_GEN = /^[a-z0-9\-\._ ]+$/i;
var MAX_REPEAT = 25;

function tmpgen(path, opts) {
  var kind = kindOf(path);

  if (path == null) {
    path = defaultSpec();
  } else if (kind === 'object') {
    // (opts)
    opts = path, path = defaultSpec();
  } else if (kind !== 'string') {
    throw new Error('Path must be a string, got: ' + kind);
  } else if (isAbsolute(path)) {
    throw new Error('Path must be relative, got: ' + path);
  }

  opts = opts || {};
  opts.gen = getGenerator(opts.gen);

  // Create custom root, so it isn't recorded (and deletable)
  if (opts.root) mkdirp.sync(opts.root);

  var root = opts.root ? opts.root : opts.parent ? opts.parent() : TMP;
  if (!root || unixify(root) === '/') throw new Error('tmpgen: root is empty or "/"');
  var abs = resolve(root, path);

  // Check if `abs` is in TMP or custom root
  if (!isPathInside(abs, root)) {
    var desc = 'resolves to a path outside or equal to the root folder';
    throw new Error('tmpgen: spec "' + path + '" ' + desc + ' "' + root + '"');
  }

  var rel = relative(root, abs);
  var segments = split(rel);
  var ctx = { created: [], history: [], fill: [] };

  var fn = pathFactory.bind(ctx, path, segments, opts, root);

  // For debug purposes
  fn.gen = opts.gen;
  fn.ctx = ctx;

  fn.sub = function (path) {
    var subOpts = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

    if (path == null || path === '') {
      throw new Error('tmpgen: path spec for child may not be null or empty');
    }

    return tmpgen(path, _extends({}, opts, subOpts, { parent: fn }));
  };

  fn.del = function (path) {
    var deleted = [];

    if (path === undefined) {
      ctx.created = ctx.created.filter(function (p) {
        return !del(p);
      });
    } else if (typeof path !== 'string') {
      throw new Error('tmpgen: expected a string path, got ' + kindOf(path));
    } else {
      var resolved = resolve(root, path);

      for (var i = 0, l = ctx.history.length; i < l; i++) {
        if (ctx.history[i] === resolved) {
          if (del(resolved)) ctx.history.splice(i, 1);
          return;
        } else if (isPathInside(resolved, ctx.history[i])) {
          return void del(resolved);
        }
      }

      throw new Error('tmpgen: this factory did not create path "' + path + '" or an ancestor');
    }

    function del(p) {
      for (var i = deleted.length; i--;) {
        if (deleted[i] === p || isPathInside(p, deleted[i])) return true;
      }

      if (!isPathInside(p, root)) {
        throw new Error('tmpgen: path "' + p + '" is not inside root "' + root + '"');
      }

      try {
        rimraf.sync(p);
        deleted.push(p);
        return true;
      } catch (_) {}
    }
  };

  if (opts.clean) {
    process.on('exit', function (code) {
      if (!code || opts.always) {
        try {
          fn.del();
        } catch (_) {}
      }
    });
  }

  return fn;
}

function getGenerator(gen) {
  if (gen == null || gen === 'timestamp' || gen === 'ts') {
    return ts;
  } else if (gen === 'random' || gen === 'hat') {
    return hat;
  } else if (gen === 'alpha') {
    return makeAlphaGen();
  } else {
    var type = kindOf(gen);

    if (type !== 'function') {
      var msg = 'tmpgen: expected function or string name of generator, got: ' + type;
      throw new Error(msg);
    }
  }

  return gen;
}

function pathFactory(path, segments, opts, root) {
  for (var _len = arguments.length, extraPath = Array(_len > 4 ? _len - 4 : 0), _key = 4; _key < _len; _key++) {
    extraPath[_key - 4] = arguments[_key];
  }

  segments = segments.slice();

  var base = [root],
      fill = this.fill.slice();

  while (segments.length) {
    var dynamic = null;

    while (segments.length && dynamic === null) {
      var seg = segments.shift();

      if (seg.indexOf('*') >= 0) {
        if (fill.length) base.push(fill.shift());else dynamic = seg;
      } else {
        base.push(seg);
      }
    }

    var baseString = join.apply(undefined, _toConsumableArray(base));

    if (dynamic === null) {
      var made = recordMkdir(baseString, this.created);

      if (made == null && !segments.length) {
        var desc = 'does not contain wildcards and resolves to existing path';
        throw new Error('tmpgen: spec "' + path + '" ' + desc + ' "' + baseString + '"');
      }

      base = [baseString];
      break;
    }

    var p = null,
        evaluated = undefined; // TODO: remember last

    for (var i = 0; i <= MAX_REPEAT && p === null; i++) {
      // i||1 means we don't repeat names the first two tries.
      // The second try is to see if the generator makes a new name
      // If it does not, we start repeating.
      var res = make(baseString, dynamic, i || 1, opts.gen, p, this.created);
      p = res.created;
      evaluated = res.evaluated;
    }

    if (p === null) throw new Error('tmpgen: failed to create path');

    this.fill.push(evaluated);
    base = [p];
  }

  // Last wildcard stays dynamic
  this.fill.pop();

  var result = base[0];

  if (extraPath.length && extraPath[0] != null) {
    extraPath = flatten(extraPath);
    var sub = resolve.apply(undefined, [result].concat(_toConsumableArray(extraPath)));

    if (!isPathInside(sub, result)) {
      var desc = 'resolves to a path outside or equal to';
      throw new Error('tmpgen: sub-path "' + extraPath.join(sep) + '" ' + desc + ' "' + result + '"');
    }

    recordMkdir(sub, this.created);
    result = sub;
  }

  this.history.push(result);
  return result;
}

function recordMkdir(path, record) {
  var made = mkdirp.sync(path);
  if (made != null) record.push(made);
  return made;
}

function flatten(input) {
  var output = [];

  var stack = input.slice();

  while (stack.length) {
    var node = stack.shift();
    if (Array.isArray(node)) stack.unshift.apply(stack, _toConsumableArray(node));else output.push(node);
  }

  return output;
}

function split(relativePath) {
  return unixify(relativePath).split('/').filter(validSegment);
}

function make(base, dynamic, repeat, gen, prev, record) {
  var evaluated = evaluate(dynamic, repeat, gen);

  if (prev != null && prev === evaluated) return null;

  var maybe = join(base, evaluated);
  var made = recordMkdir(maybe, record);

  return { created: made != null ? maybe : null, evaluated: evaluated };
}

function evaluate(dynamic, repeat, gen) {
  var evaluated = dynamic.replace(/\*/g, function () {
    var result = '';

    for (var i = 0; i < repeat; i++) {
      var _name = gen();

      if (typeof _name === 'number') _name = '' + _name;

      if (typeof _name !== 'string') {
        var type = kindOf(_name);
        throw new Error('tmpgen: generated name must be a string or number, got: ' + type);
      } else if (_name === '') {
        throw new Error('tmpgen: generated name is empty');
      } else if (!ALLOWED_GEN.test(_name)) {
        throw new Error('tmpgen: generated name contains illegal characters: ' + _name);
      }

      result += _name;
    }

    return result;
  });

  return evaluated;
}

function makeAlphaGen() {
  return function alphaGen() {
    var n = (alphaGen.n || 96) + 1;
    if (n > 122) n = 97;
    alphaGen.n = n;
    return String.fromCharCode(n);
  };
}

// Don't need this anymore?
function validSegment(segment) {
  if (segment === '..') {
    throw new Error('tmpgen: path goes outside of root');
  }

  return true;
}

function defaultSpec() {
  var parent = packpath.parent();
  if (!parent) parent = packpath.self();
  if (!parent) throw new Error('tmpgen: could not find parent or own package');

  var name = require(join(parent, 'package.json')).name;
  if (!name) throw new Error('tmpgen: could not find parent name or own name');

  return name + '/*';
}

module.exports = tmpgen;
module.exports.generator = getGenerator;