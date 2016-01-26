'use strict';

const kindOf = require('kindof')
    , unixify = require('unixify')
    , mkdirp = require('mkdirp')
    , isPathInside = require('is-path-inside')
    , packpath = require('packpath')
    , ts = require('monotonic-timestamp')
    , hat = require('hat').rack()
    , rimraf = require('rimraf')

const { resolve, sep, relative, isAbsolute, join } = require('path')

const TMP = require('osenv').tmpdir()
const ALLOWED_GEN = /^[a-z0-9\-\._ ]+$/i
const MAX_REPEAT = 25

function tmpgen(path, opts) {
  const kind = kindOf(path)

  if (path == null) {
    path = defaultSpec()
  } else if (kind === 'object') { // (opts)
    opts = path, path = defaultSpec()
  } else if (kind !== 'string') {
    throw new Error('Path must be a string, got: ' + kind)
  } else if (isAbsolute(path)) {
    throw new Error('Path must be relative, got: ' + path)
  }

  opts = opts || {}
  opts.gen = getGenerator(opts.gen)

  // Create custom root, so it isn't recorded (and deletable)
  if (opts.root) mkdirp.sync(opts.root)

  const root = opts.root ? opts.root : opts.parent ? opts.parent() : TMP
  if (!root || unixify(root) === '/') throw new Error(`tmpgen: root is empty or "/"`)
  const abs = resolve(root, path)

  // Check if `abs` is in TMP or custom root
  if (!isPathInside(abs, root)) {
    const desc = 'resolves to a path outside or equal to the root folder'
    throw new Error(`tmpgen: spec "${path}" ${desc} "${root}"`)
  }

  const rel = relative(root, abs)
  const segments = split(rel)
  const ctx = { paths: [] }

  const fn = pathFactory.bind(ctx, path, segments, opts, root)

  // For debug purposes
  fn.gen = opts.gen
  fn.ctx = ctx

  fn.sub = (path, subOpts = {}) => {
    if (path == null || path === '') {
      throw new Error('tmpgen: path spec for child may not be null or empty')
    }

    return tmpgen(path, {...opts, ...subOpts, parent: fn})
  }

  fn.del = (path) => {
    const deleted = []

    if (path === undefined) {
      ctx.paths = ctx.paths.filter(p => !del(p))
    } else if (typeof path !== 'string') {
      throw new Error('tmpgen: expected a string path, got ' + kindOf(path))
    } else {
      for(let i=0, l=ctx.paths.length; i<l; i++) {
        const resolved = resolve(ctx.paths[i], path)

        if (ctx.paths[i] === resolved) {
          if (del(resolved)) ctx.paths.splice(i, 1)
          return
        } else if (isPathInside(resolved, ctx.paths[i])) {
          return void del(resolved)
        }
      }

      throw new Error(`tmpgen: this factory did not create path "${path}" or an ancestor`)
    }

    function del(p) {
      for(let i=deleted.length; i--;) {
        if (deleted[i] === p || isPathInside(p, deleted[i])) return true
      }

      if (!isPathInside(p, root)) {
        throw new Error(`tmpgen: path "${p}" is not inside root "${root}"`)
      }

      try {
        rimraf.sync(p)
        deleted.push(p)
        return true
      } catch(_) {}
    }
  }

  if (opts.clean) {
    process.on('exit', (code) => {
      if (!code || opts.always) {
        try { fn.del() } catch(_) { }
      }
    })
  }

  return fn
}

function getGenerator(gen) {
  if (gen == null || gen === 'timestamp' || gen === 'ts') {
    return ts
  } else if (gen === 'random' || gen === 'hat') {
    return hat
  } else if (gen === 'alpha') {
    return makeAlphaGen()
  } else {
    const type = kindOf(gen)

    if (type !== 'function') {
      const msg = `tmpgen: expected function or string name of generator, got: ${type}`
      throw new Error(msg)
    }
  }

  return gen
}

function pathFactory(path, segments, opts, root, ...extraPath) {
  segments = segments.slice()

  if (!this.fill) this.fill = []
  let base = [root], fill = this.fill.slice()

  while(segments.length) {
    let dynamic = null;

    while(segments.length && dynamic === null) {
      const seg = segments.shift()

      if (seg.indexOf('*') >= 0) {
        if (fill.length) base.push(fill.shift())
        else dynamic = seg
      } else {
        base.push(seg)
      }
    }

    const baseString = join(...base)

    if (dynamic === null) {
      const made = recordMkdir(baseString, this.paths)

      if (made == null && !segments.length) {
        const desc = 'does not contain wildcards and resolves to existing path'
        throw new Error(`tmpgen: spec "${path}" ${desc} "${baseString}"`)
      }

      base = [baseString]
      break
    }

    let p = null, evaluated; // TODO: remember last

    for(let i=0; i<=MAX_REPEAT && p === null; i++) {
      // i||1 means we don't repeat names the first two tries.
      // The second try is to see if the generator makes a new name
      // If it does not, we start repeating.
      const res = make(baseString, dynamic, i||1, opts.gen, p, this.paths)
      p = res.created
      evaluated = res.evaluated
    }

    if (p === null) throw new Error('tmpgen: failed to create path')

    this.fill.push(evaluated)
    base = [p]
  }

  // Last wildcard stays dynamic
  this.fill.pop()

  let result = base[0]

  if (extraPath.length && extraPath[0] != null) {
    extraPath = flatten(extraPath)
    const sub = resolve(result, ...extraPath)

    if (!isPathInside(sub, result)) {
      const desc = 'resolves to a path outside or equal to'
      throw new Error(`tmpgen: sub-path "${extraPath.join(sep)}" ${desc} "${result}"`)
    }

    recordMkdir(sub, this.paths)
    result = sub
  }

  return result
}

function recordMkdir(path, record) {
  const made = mkdirp.sync(path)
  if (made != null) record.push(made)
  return made
}

function flatten(input) {
  const output = []

  let stack = input.slice()

  while(stack.length) {
    const node = stack.shift()
    if (Array.isArray(node)) stack.unshift(...node)
    else output.push(node)
  }

  return output
}

function split(relativePath) {
  return unixify(relativePath).split('/').filter(validSegment)
}

function make(base, dynamic, repeat, gen, prev, record) {
  const evaluated = evaluate(dynamic, repeat, gen)

  if (prev != null && prev === evaluated) return null

  const maybe = join(base, evaluated)
  const made = recordMkdir(maybe, record)

  return { created: made != null ? maybe : null, evaluated }
}

function evaluate(dynamic, repeat, gen) {
  const evaluated = dynamic.replace(/\*/g, () => {
    let result = '';

    for(let i=0; i<repeat; i++) {
      let name = gen()

      if (typeof name === 'number') name = ''+name

      if (typeof name !== 'string') {
        const type = kindOf(name)
        throw new Error('tmpgen: generated name must be a string or number, got: ' + type)
      } else if (name === '') {
        throw new Error('tmpgen: generated name is empty')
      } else if (!ALLOWED_GEN.test(name)) {
        throw new Error('tmpgen: generated name contains illegal characters: ' + name)
      }

      result+= name
    }

    return result
  })

  return evaluated
}

function makeAlphaGen() {
  return function alphaGen() {
    let n = (alphaGen.n || 96) + 1
    if (n > 122) n = 97
    alphaGen.n = n
    return String.fromCharCode(n)
  }
}

// Don't need this anymore?
function validSegment(segment) {
  if (segment === '..') {
    throw new Error('tmpgen: path goes outside of root')
  }

  return true
}

function defaultSpec() {
  var parent = packpath.parent()
  if (!parent) parent = packpath.self()
  if (!parent) throw new Error('tmpgen: could not find parent or own package')

  var name = require(join(parent, 'package.json')).name
  if (!name) throw new Error('tmpgen: could not find parent name or own name')

  return name + '/*'
}

module.exports = tmpgen
module.exports.generator = getGenerator
