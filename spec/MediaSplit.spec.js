'use strict'

const MediaSplit = require('../lib/es6/MediaSplit.js')
const expect = require('chai').expect

describe('MediaSplit', function () {
  let split

  describe('_isUrl', function () {
    afterEach(() => split = null)
    beforeEach(() => split = new MediaSplit())

    it('should match url', () => {
      expect(split._isUrl('http://www.youtube.com/watch?v=-wtIMTCHWuI')).to.true
      expect(split._isUrl('https://www.youtube.com.br/v/-wtIMTCHWuI?version=3&autohide=1')).to.be.true
      expect(split._isUrl('http://www.youtu.be/-wtIMTCHWuI')).to.be.true
      expect(split._isUrl('http://youtu.be/-wtIMTCHWuI')).to.be.true
      expect(split._isUrl('youtube.com/watch?v=-wtIMTCHWuI')).to.be.true
      expect(split._isUrl('youtube.com.br/watch?v=-wtIMTCHWuI')).to.be.true
    })

    it('should not match url', () => {
      expect(split._isUrl('foo')).to.be.false
      expect(split._isUrl('foo.a')).to.be.false
    })
  })

  describe('_parseMedia', function () {
    afterEach(() => split = null)

    it('should parse sections correctly', () => {
      split = new MediaSplit({
        format: 'm4a',
        sections: [
          '[00:00] foo',
          '[01:30] bar',
          '[03:28.222] Test _ file',
          '[05:52.1] Qux',
        ]
      })

      const parsed = split._parseMedia()
      expect(parsed).to.length(4)

      expect(parsed[0].trackName).to.be.equals('foo')
      expect(parsed[0].name).to.be.equals('foo.m4a')
      expect(parsed[0].start).to.be.equals('00:00')
      expect(parsed[0].end).to.be.equals('01:30')

      expect(parsed[1].trackName).to.be.equals('bar')
      expect(parsed[1].name).to.be.equals('bar.m4a')
      expect(parsed[1].start).to.be.equals('01:30')
      expect(parsed[1].end).to.be.equals('03:28.222')

      expect(parsed[2].trackName).to.be.equals('Test _ file')
      expect(parsed[2].name).to.be.equals('Test _ file.m4a')
      expect(parsed[2].start).to.be.equals('03:28.222')
      expect(parsed[2].end).to.be.equals('05:52.1')

      expect(parsed[3].trackName).to.be.equals('Qux')
      expect(parsed[3].name).to.be.equals('Qux.m4a')
      expect(parsed[3].start).to.be.equals('05:52.1')
      expect(parsed[3].end).to.be.equals(null)
    })

    it('should throw on invalid start', () => {
      split = new MediaSplit({
        sections: ['[00:AB.!] FOO']
      })
      expect(() => split._parseMedia()).to.throw('Unable to extract start time from line 1')
    })

    it('should throw on invalid end', () => {
      split = new MediaSplit({
        sections: [
          '[00:00] FOO',
          '[AB:CC] BAR'
        ]
      })
      expect(() => split._parseMedia()).to.throw('Unable to extract end time from line 2')
    })
  })
})

