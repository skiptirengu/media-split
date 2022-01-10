'use strict'

const expect = require('chai').expect
const spawnSync = require('child_process').spawnSync
const path = require('path')

describe('Command', () => {
  it('should return 0 code', () => {
    const binPath = path.resolve('cli/index.js')
    const proc = spawnSync('node', [ binPath, 'h' ])
    expect(proc.status).to.be.equal(0)
  })
})
