'use strict'

const globalModules = require('global-modules')
const path = require('path')
const spawnSync = require('child_process').spawnSync

function global (lib) {
  return path.join(globalModules, lib)
}

const libs = {
  // local installation
  '@ffmpeg-installer/ffmpeg': (lib) => require(lib).path,
  'ffmpeg-static': (lib) => require(lib),
  ffmpeg: (lib) => {
    const proc = spawnSync(lib)
    if (proc.error instanceof Error) {
      throw proc.error
    } else {
      return lib
    }
  },
  [ global('@ffmpeg-installer/ffmpeg') ]: (lib) => require(lib).path,
  [ global('ffmpeg-static') ]: (lib) => require(lib)
}

module.exports = null

for (const libName of Object.keys(libs)) {
  try {
    module.exports = libs[ libName ](libName)
    break
  } catch (e) {
    // eslint-disable-line no-empty
  }
}
