'use strict'

const expect = require('chai').expect
const mockRequire = require('mock-require')
const childProcess = require('child_process')
const global = require('global-modules')
const path = require('path')

describe('FFmpeg', function () {
  const moduleName = '../lib/FFmpeg.js'
  const errorModule = './data/throwing.js'
  const defaultSpawn = childProcess.spawnSync

  function cleanup () {
    delete require.cache[ require.resolve(path.join(__dirname, moduleName)) ]
    mockRequire.stopAll()
    childProcess.spawnSync = defaultSpawn
  }

  beforeEach(cleanup)
  afterEach(cleanup)

  it('should prefer @ffmpeg-installer', function () {
    mockRequire('@ffmpeg-installer/ffmpeg', { path: 'foo' })
    const require1 = require(moduleName)
    expect(require1).to.be.equals('foo')
  })

  it('should fallback to ffmpeg-binaries', function () {
    mockRequire('@ffmpeg-installer/ffmpeg', errorModule)
    mockRequire('ffmpeg-binaries', 1)
    const require1 = require(moduleName)
    expect(require1).to.be.equals(1)
  })

  it('should fallback to ffmpeg on $PATH', function () {
    let called = false
    mockRequire('@ffmpeg-installer/ffmpeg', errorModule)
    mockRequire('ffmpeg-binaries', errorModule)
    childProcess.spawnSync = function (cmd) {
      called = true
      expect(cmd).to.be.equals('ffmpeg')
      return 'FFmpeg output'
    }
    expect(require(moduleName)).to.be.equals('ffmpeg')
    expect(called).to.be.true
  })

  it('should fallback to global @ffmpeg-installer', function () {
    mockRequire('@ffmpeg-installer/ffmpeg', errorModule)
    mockRequire('ffmpeg-binaries', errorModule)
    childProcess.spawnSync = errorSpawn
    mockRequire(path.join(global, '@ffmpeg-installer/ffmpeg'), { path: 'qux' })
    expect(require(moduleName)).to.be.equals('qux')
  })

  it('should fallback to global ffmpeg-binaries', function () {
    mockRequire('@ffmpeg-installer/ffmpeg', errorModule)
    mockRequire('ffmpeg-binaries', errorModule)
    childProcess.spawnSync = errorSpawn
    mockRequire(path.join(global, '@ffmpeg-installer/ffmpeg'), errorModule)
    mockRequire(path.join(global, 'ffmpeg-binaries'), 2)
    expect(require(moduleName)).to.be.equals(2)
  })

  function errorSpawn () {
    return { error: new Error() }
  }
})
