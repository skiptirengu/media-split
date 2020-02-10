'use strict'

const MediaSplit = require('../lib/MediaSplit.js')
const expect = require('chai').expect
const path = require('path')
const fs = require('fs')
const duration = require('mp3-duration')
const mockRequire = require('mock-require')

const outputPath = path.join(process.cwd(), 'spec', 'output')
const dataPath = path.join(process.cwd(), 'spec', 'data')

describe('MediaSplit', function () {
  let split

  afterEach(() => {
    split = null
  })
  beforeEach(() => {
    split = new MediaSplit()
  })

  describe('_optimalNumberOfWorkers', function () {
    beforeEach(() => {
      mockRequire.stopAll()
    })
    afterEach(() => {
      mockRequire.stopAll()
    })

    it('should return 1 by default', () => {
      mockRequire('os', { cpus: () => new Array(1) })
      expect(split._optimalNumberOfWorkers()).to.be.equals(1)
    })

    it('should return correct value for multiple cpus', () => {
      mockRequire('os', { cpus: () => new Array(8) })
      expect(split._optimalNumberOfWorkers()).to.be.equals(7)
    })
  })

  describe('_isUrl', function () {
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

  describe('_checkDownloadCache', function () {
    const mockFile = path.join(outputPath, 'mock_file.mp4')

    afterEach(() => {
      fs.unlinkSync(mockFile)
    })

    it('should invalidate cache if sizes don\'t match', async () => {
      const info = { foo: 'bar' }
      let called = false

      fs.writeFileSync(mockFile, 'Foo bar')
      split = new MediaSplit({
        format: 'mp4',
        output: outputPath
      })

      let data
      split._downloadFile = (info) => {
        data = info
        called = true
        return Promise.resolve()
      }
      split._getReqLib = function () {
        return {
          request (url, cb) {
            // eslint-disable-next-line standard/no-callback-literal
            cb({ statusCode: 200, headers: { 'content-length': 123488 } })
            return { end: () => null, on: () => null }
          }
        }
      }

      split._inputFile = mockFile
      await split._checkDownloadCache({ url: 'http://skiptirengu.com/video/' }, info)
      expect(called).to.be.true
      expect(data).to.be.deep.equals(info)
    })
  })

  describe('_parseMedia', function () {
    it('should parse sections correctly', () => {
      split = new MediaSplit({
        format: 'm4a',
        sections: [
          '[00:00] foo',
          '[01:30] bar',
          '[03:28.222] Test _ file',
          '[05:52.1 - 07:24] Qux - abc',
          '[07:50] -[Song - tag][name]',
          '[10:55 - 12:00] Nujabes - City Lights (ft. Pase Rock & Substantial)',
          '[01:05:50] Test with hour',
          '[02:05:50 - 2:1:1.500] Test with hour range'
        ]
      })

      const parsed = split._parseMedia()
      expect(parsed).to.length(8)

      expect(parsed[ 0 ].trackName).to.be.equals('foo')
      expect(parsed[ 0 ].name).to.be.equals('foo.m4a')
      expect(parsed[ 0 ].start).to.be.equals('00:00')
      expect(parsed[ 0 ].end).to.be.equals('01:30')

      expect(parsed[ 1 ].trackName).to.be.equals('bar')
      expect(parsed[ 1 ].name).to.be.equals('bar.m4a')
      expect(parsed[ 1 ].start).to.be.equals('01:30')
      expect(parsed[ 1 ].end).to.be.equals('03:28.222')

      expect(parsed[ 2 ].trackName).to.be.equals('Test _ file')
      expect(parsed[ 2 ].name).to.be.equals('Test _ file.m4a')
      expect(parsed[ 2 ].start).to.be.equals('03:28.222')
      expect(parsed[ 2 ].end).to.be.equals('05:52.1')

      expect(parsed[ 3 ].trackName).to.be.equals('Qux - abc')
      expect(parsed[ 3 ].name).to.be.equals('Qux - abc.m4a')
      expect(parsed[ 3 ].start).to.be.equals('05:52.1')
      expect(parsed[ 3 ].end).to.be.equals('07:24')

      expect(parsed[ 4 ].trackName).to.be.equals('-[Song - tag][name]')
      expect(parsed[ 4 ].name).to.be.equals('-[Song - tag][name].m4a')
      expect(parsed[ 4 ].start).to.be.equals('07:50')
      expect(parsed[ 4 ].end).to.be.equals('10:55')

      expect(parsed[ 5 ].trackName).to.be.equals('Nujabes - City Lights (ft. Pase Rock & Substantial)')
      expect(parsed[ 5 ].name).to.be.equals('Nujabes - City Lights (ft. Pase Rock & Substantial).m4a')
      expect(parsed[ 5 ].start).to.be.equals('10:55')
      expect(parsed[ 5 ].end).to.be.equals('12:00')

      expect(parsed[ 6 ].trackName).to.be.equals('Test with hour')
      expect(parsed[ 6 ].name).to.be.equals('Test with hour.m4a')
      expect(parsed[ 6 ].start).to.be.equals('01:05:50')
      expect(parsed[ 6 ].end).to.be.equals('02:05:50')

      expect(parsed[ 7 ].trackName).to.be.equals('Test with hour range')
      expect(parsed[ 7 ].name).to.be.equals('Test with hour range.m4a')
      expect(parsed[ 7 ].start).to.be.equals('02:05:50')
      expect(parsed[ 7 ].end).to.be.equals('2:1:1.500')
    })

    it('should throw on invalid start', () => {
      split = new MediaSplit({
        sections: [ '[00:AB.!] FOO' ]
      })
      expect(() => split._parseMedia()).to.throw('Line 1 does not contain a valid time range')
    })

    it('should throw on invalid end', () => {
      split = new MediaSplit({
        sections: [
          '[00:00] FOO',
          '[AB:CC] BAR'
        ]
      })
      expect(() => split._parseMedia()).to.throw('Line 2 does not contain a valid time range')
    })
  })

  describe('parse', function () {
    this.timeout(30000)

    function tearDown () {
      fs.readdirSync(outputPath).forEach((file) => {
        if ([ '.mp3', '.m4a', '.jpg' ].indexOf(path.extname(file)) !== -1) {
          fs.unlinkSync(path.join(outputPath, file))
        }
      })
    }

    beforeEach(tearDown)
    afterEach(tearDown)

    it('should parse a url', async function () {
      let counter = 0
      let video
      let filename
      let progressEvt
      let dataEvt = false

      // TODO This request should be mocked but...
      split = new MediaSplit({
        format: 'm4a',
        output: outputPath,
        input: 'https://www.youtube.com/watch?v=kN9SZtwP1ys',
        downloadCover: true,
        audioonly: true,
        sections: [
          '[00:00] Part 1',
          '[00:05 - 00:10] Part 2'
        ],
        metadata: new Map([ [ 'author', 'Foo Bar' ] ])
      })

      split.on('afterSplit', () => {
        counter++
      })
      split.on('url', (file, info) => {
        video = info.video_id
        filename = file
      })
      split.on('data', () => {
        dataEvt = true
      })
      split.on('downloadProgress', (chunk, len, total) => {
        progressEvt = total
      })

      const sections = await split.parse()
      expect(video).to.be.equals('kN9SZtwP1ys')
      expect(counter).to.be.equals(2)
      expect(sections).to.length(2)
      expect(dataEvt).to.be.true
      expect(progressEvt).to.be.equals(161161)
      expect(fs.existsSync(path.join(outputPath, 'Part 1.m4a'))).to.be.true
      expect(fs.existsSync(path.join(outputPath, 'Part 2.m4a'))).to.be.true
      expect(fs.existsSync(path.join(outputPath, 'cover.jpg'))).to.be.true
      expect(fs.existsSync(filename)).to.be.true
    })

    it('should parse a local file', async function () {
      let counter = 0
      let dataEvt = false

      split = new MediaSplit({
        output: outputPath,
        input: path.join(dataPath, 'video.mp4'),
        sections: [
          '[00:00] First',
          '[00:02.500 - 00:07] Second',
          '[00:10 - 00:11.400] Third'
        ]
      })

      split.on('beforeSplit', (info, index) => {
        info.metadata.set('track', 1)
        info.metadata.set('foo', 'bar')
        expect(index).to.be.a('number')
      })
      split.on('afterSplit', (info, index) => {
        expect(info.metadata.get('track')).to.be.equals(1)
        expect(info.metadata.get('foo')).to.be.equals('bar')
        expect(index).to.be.a('number')
        counter++
      })
      split.on('data', () => {
        dataEvt = true
      })

      const sections = await split.parse()
      expect(sections).to.length(3)
      expect(counter).to.be.equals(3)
      const values = [
        duration(path.join(outputPath, 'First.mp3')),
        duration(path.join(outputPath, 'Second.mp3')),
        duration(path.join(outputPath, 'Third.mp3'))
      ]
      const [ first, second, third ] = await Promise.all(values)
      expect(first.toString().slice(0, 3)).to.be.equals('2.5')
      expect(second.toString().slice(0, 3)).to.be.equals('4.5')
      expect(third.toString().slice(0, 3)).to.be.equals('1.4')
      expect(dataEvt).to.be.true
    })
  })
})
