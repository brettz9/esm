import "./binding.js"
import "./module/internal/make-require-function.js"
import "./safe/buffer.js"
import "./safe/crypto.js"
import "./safe/process.js"
import "./safe/util.js"
import "./safe/vm.js"
import "./util/prepare-context.js"
import "./util/satisfies.js"

import ENV from "./constant/env.js"

import Loader from "./loader.js"
import Module from "./module.js"
import Package from "./package.js"
import RealModule from "./real/module.js"
import Shim from "./shim.js"

import builtinVM from "./builtin/vm.js"
import errors from "./errors.js"
import getModuleName from "./util/get-module-name.js"
import globalHook from "./hook/global.js"
import hasLoaderValue from "./env/has-loader-value.js"
import isInstalled from "./util/is-installed.js"
import isObject from "./util/is-object.js"
import isOwnPath from "./util/is-own-path.js"
import isSideloaded from "./env/is-sideloaded.js"
import keys from "./util/keys.js"
import mainHook from "./hook/main.js"
import moduleHook from "./hook/module.js"
import pnp from "./pnp.js"
import processHook from "./hook/process.js"
import realProcess from "./real/process.js"
import realVM from "./real/vm.js"
import requireHook from "./hook/require.js"
import { sep } from "./safe/path.js"
import shared from "./shared.js"
import vmHook from "./hook/vm.js"

const {
  CHECK,
  CLI,
  EVAL,
  FLAGS,
  INTERNAL,
  PRELOADED,
  REPL,
  YARN_PNP
} = ENV

const {
  ERR_INVALID_ARG_TYPE
} = errors

const YARN_PNP_FILENAME = ".pnp.js"

let exported

if (shared.inited &&
    ! shared.reloaded) {
  Shim.enable(shared.unsafeGlobal)

  exported = (mod, options) => {
    if (! isObject(mod)) {
      throw new ERR_INVALID_ARG_TYPE("module", "object")
    }

    let cacheKey

    if (options === void 0) {
      const pkg = Package.from(mod)

      if (pkg !== null) {
        cacheKey = JSON.stringify(pkg.options)
      }
    } else {
      options = Package.createOptions(options)

      cacheKey = JSON.stringify({
        name: getModuleName(mod),
        options
      })
    }

    if (cacheKey !== void 0) {
      Loader.init(cacheKey)
    }

    if (options !== void 0) {
      Package.from(mod, options)
    }

    moduleHook(Module, mod)

    if (! isInstalled(mod)) {
      processHook(realProcess)
    }

    if (YARN_PNP) {
      const { _cache } = Module

      for (const name in _cache) {
        if (name.endsWith(sep + YARN_PNP_FILENAME)) {
          Reflect.deleteProperty(_cache, name)
          break
        }
      }

      for (const request of FLAGS.preloadModules) {
        if (request.endsWith(sep + YARN_PNP_FILENAME)) {
          Module._preloadModules([request])
          pnp._resolveFilename = Module._resolveFilename
          break
        }
      }
    }

    return requireHook(mod)
  }
} else {
  exported = shared
  exported.inited = true
  exported.reloaded = false

  Shim.enable(shared.safeGlobal)
  Shim.enable(shared.unsafeGlobal)

  if (CHECK) {
    vmHook(realVM)
  } else if (EVAL ||
      REPL) {
    moduleHook(Module)
    processHook(realProcess)
    vmHook(realVM)
  } else if (CLI ||
      INTERNAL ||
      isSideloaded()) {
    moduleHook(RealModule)
    mainHook(RealModule)
    processHook(realProcess)
  }

  if (EVAL) {
    RealModule.prototype._compile = Module.prototype._compile
  }

  if (INTERNAL) {
    globalHook(shared.unsafeGlobal)
  }

  if (REPL) {
    const names = keys(builtinVM)

    for (const name of names) {
      builtinVM[name] = realVM[name]
    }
  }

  if (PRELOADED) {
    const { _cache } = Module

    for (const name in _cache) {
      if (! isOwnPath(name)) {
        Reflect.deleteProperty(_cache, name)
      }
    }

    const { preloadModules } = FLAGS
    const { length } = preloadModules
    const preloads = []

    let i = -1
    let pnpIndex = -1

    while (++i < length) {
      const request = preloadModules[i]

      if (! hasLoaderValue(request)) {
        if (request.endsWith(sep + YARN_PNP_FILENAME)) {
          pnpIndex = i
        }

        preloads.push(request)
      }
    }

    if (pnpIndex !== -1) {
      const pos = pnpIndex + 1

      Module._preloadModules(preloads.slice(0, pos))
      pnp._resolveFilename = Module._resolveFilename
      Module._preloadModules(preloads.slice(pos))
    } else {
      Module._preloadModules(preloads)
    }
  }
}

export default exported
