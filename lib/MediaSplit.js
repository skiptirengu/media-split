'use strict'

const sanitize = require('sanitize-filename')
const ytdl = require('ytdl-core')

const EventEmitter = require('events').EventEmitter
const path = require('path')
const fs = require('fs')
const http = require('http')
const https = require('https')
const url = require('url')
const spawn = require('child_process').spawn

const urlRe = /(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_+.~#?&/=]*)/g
const hasTimeRe = /\[[.:\d]+([ \t]+-[ \t]+[.:\d]+)?]/g
const timeRe = /(^\[([\d]{1,2}[:])*[\d]{1,2}[:][\d]{1,2}([.][\d]{1,4})?])+/g

/**
 * @extends EventEmitter
 */
class MediaSplit extends EventEmitter {
  /**
   * @param {object} options
   * @param {boolean} options.downloadCover - Whether to download the cover from the YouTube video
   * @param {string} options.input - The input file. Can be either a file path or a YouTube url
   * @param {number} options.concurrency - Number of parallel workers MediaSplit will spawn at once
   * @param {string[]} options.sections - Sections to extract from the input source
   * @param {string} options.output - Output path
   * @param {string} options.format - Output format (mp3, m4a, flac, etc)
   * @param {boolean} options.audioonly - Force download only audio files when using a url as input
   * @return MediaSplit
   */
  constructor (options = {}) {
    super()

    // default options
    const defaults = {
      downloadCover: true,
      input: '',
      concurrency: 3,
      metadata: [],
      sections: [],
      output: '.',
      format: 'mp3',
      audioonly: false
    }

    this._options = Object.assign(defaults, options)
    this._inputFile = ''
    this._downloadOptions = {}
  }

  parse () {
    return this._checkDirectory(this._options.output)
      .then(() => this._handleInput())
      .then(() => this._parseMedia())
      .then((sections) => {
        return this._splitMedia(sections)
      })
  }

  _handleInput () {
    if (this._isUrl(this._options.input)) {
      return this._handleUrl()
    } else {
      return this._handleFile()
    }
  }

  _handleUrl () {
    return ytdl.getInfo(this._options.input).then((info) => {
      this._downloadOptions = { quality: 'highestaudio', filter: this._options.audioonly ? 'audioonly' : undefined }

      const format = ytdl.chooseFormat(info.formats, this._downloadOptions)

      if ((format instanceof Error)) {
        throw format
      } else if (!format.container) {
        throw new Error('Could not find a suitable download format')
      }

      this._inputFile = path.join(
        this._options.output, this._fileName(info.title, format.container)
      )

      this.emit('url', this._inputFile, info)

      if (this._options.downloadCover) {
        this._downloadCover()
      }

      return this._checkDownloadCache(format, info)
    })
  }

  _checkDownloadCache (format, info) {
    const file = this._inputFile

    return this._stat(file)
      .then((stat) => {
        if (!stat.isFile()) {
          return this._downloadFile(info, file)
        }

        return this._checkCachedFileIsValid(stat, format.url)
          .then((valid) => valid ? file : this._downloadFile(info, file))
      })
      .catch((err) => {
        if (err.code === 'ENOENT') {
          return this._downloadFile(info, file)
        } else {
          throw err
        }
      })
  }

  _downloadFile (info, file) {
    return new Promise((resolve, reject) => {
      ytdl.downloadFromInfo(info, this._downloadOptions)
        .pipe(fs.createWriteStream(file))
        .once('finish', resolve)
        .once('error', reject)
    })
  }

  _checkCachedFileIsValid (stat, ytUrl) {
    return new Promise((resolve) => {
      const reqLib = this._getReqLib(ytUrl)
      const parsed = url.parse(ytUrl)
      parsed.method = 'HEAD'
      const req = reqLib.request(parsed, (response) => {
        if (!(response.statusCode >= 200 && response.statusCode < 300)) {
          resolve(false)
        } else {
          resolve(parseInt(response.headers[ 'content-length' ]) === stat.size)
        }
      })
      req.on('error', () => resolve(false))
      req.end()
    })
  }

  _getReqLib (ytUrl) {
    return ytUrl.startsWith('https') ? https : http
  }

  _downloadCover () {
    this.emit('warning', 'Unable to download')
  }

  _handleFile () {
    const options = this._options
    return this._checkAccess(options.input, fs.R_OK)
      .then((file) => {
        this._inputFile = file
      })
      .catch(() => {
        throw new Error(`Input file "${options.input}" is not readable`)
      })
  }

  _isUrl (input) {
    return (typeof input === 'string') && !!input.match(urlRe)
  }

  _fileName (file, ext) {
    return sanitize(path.parse(file).name).toString().trim().concat(`.${ext}`)
  }

  _resolveFormat () {
    const options = this._options
    if (options.format) {
      return options.format.replace('.', '')
    } else {
      return 'mp3'
    }
  }

  _parseMedia () {
    const sections = this._options.sections
    const parsed = []

    for (let index in sections) {
      const curr = sections[ index ]
      const line = parseInt(index) + 1
      const time = this._extractTimeRangeFromLine(curr)

      if (time === null) {
        throw new Error(`Line ${line} does not contain a valid time range`)
      }

      let { start, end } = this._extractTimeInfo(time)

      if (start === null) {
        throw new Error(`Unable to extract start time from line ${line}`)
      }

      if (line < sections.length && end === null) {
        let time = this._extractTimeRangeFromLine(sections[ line ])

        if (time === null) {
          throw new Error(`Line ${line + 1} does not contain a valid time range`)
        }

        if ((end = this._extractTimeInfo(time).start) === null) {
          throw new Error(`Unable to extract end time from line ${line + 1}`)
        }
      }

      // remove time info from final filename
      const trackName = curr.replace(time, '').trim()
      parsed.push({
        name: this._fileName(trackName, this._resolveFormat()),
        start: this._removeBrackets(start),
        end: this._removeBrackets(end),
        trackName
      })
    }

    parsed.sort((a, b) => a.start - b.start)
    return parsed
  }

  _removeBrackets (str) {
    return str ? str.toString().replace(/[[\]]+/g, '') : str
  }

  _extractTimeRangeFromLine (line) {
    const timeInfo = line.match(hasTimeRe)
    // This line does not have any time info
    if (timeInfo === null) {
      return null
    } else {
      return timeInfo.pop()
    }
  }

  _extractTimeInfo (str) {
    const timeInfo = str.match(hasTimeRe)
    // This line does not have any time info
    if (timeInfo === null) {
      return {}
    }
    const period = timeInfo.pop()
    if (period.indexOf('-') !== -1) {
      // Has start and end times
      return this._extractStartAndEndTime(period)
    } else {
      // Has only start time
      return this._extractStartTime(period)
    }
  }

  _extractStartAndEndTime (period) {
    let [ start, end ] = this._removeBrackets(period).split('-')
    return {
      start: `[${start.trim()}]`.match(timeRe).pop(),
      end: `[${end.trim()}]`.match(timeRe).pop()
    }
  }

  _extractStartTime (period) {
    return { start: period.match(timeRe).pop(), end: null }
  }

  _splitMedia (sections) {
    const binFFmpeg = require('./FFmpeg.js')

    if (!binFFmpeg) {
      return Promise.reject(
        new Error('Unable to spawn FFmpeg\'s process. Make sure it installed and available on your path')
      )
    }

    // Number of tasks in execution
    let concurrentTasks = 0
    let maxTasks = this._options.concurrency

    this.emit('data', sections)

    const promises = sections.map((section, index) => {
      return new Promise((resolve, reject) => {
        let args = [
          '-hide_banner',
          '-loglevel', 'repeat+error',
          '-y',
          '-i', this._inputFile,
          '-ss', section.start
        ]

        // section end
        if (section.end !== null) {
          args.push('-to', section.end)
        }

        // user provided metadata
        args = args.concat(this._options.metadata.map((m) => [ '-metadata', `${m.name}=${m.value}` ]))

        // title and track metadata
        args.push('-metadata', `title=${section.trackName}`)
        args.push('-metadata', `track=${index + 1}`)

        // output
        args.push(path.join(this._options.output, section.name))

        const interval = setInterval(() => {
          // keep executing until one of the workers is done
          if (concurrentTasks >= maxTasks) {
            return
          }

          // remove this worker from the queue
          clearInterval(interval)
          concurrentTasks++
          this.emit('beforeSplit', section)

          const proc = spawn(binFFmpeg, args, { stdio: [ 'ignore', process.stdout, process.stderr ] })
          proc.once('error', (err) => {
            concurrentTasks--
            reject(err)
          })
          proc.once('close', () => {
            this.emit('afterSplit', section)
            concurrentTasks--
            resolve(section)
          })
        }, 1000)
      })
    })

    return Promise.all(promises)
  }

  _checkAccess (dir, mode) {
    return new Promise((resolve, reject) => fs.access(dir, mode, (err) => err ? reject(err) : resolve(dir)))
  }

  _checkDirectory (dir) {
    return this._stat(dir).then((stat) => {
      if (!stat.isDirectory()) {
        throw new Error(`Output path "${dir}" is not a directory`)
      }
      return this._checkAccess(dir, fs.W_OK).catch(() => {
        throw new Error(`Output path "${dir}" is not writable`)
      })
    })
  }

  _stat (dir) {
    return new Promise((resolve, reject) => {
      fs.stat(dir, (err, stat) => {
        if (err) {
          return reject(err)
        } else {
          return resolve(stat)
        }
      })
    })
  }
}

/**
 * URL event
 * @event MediaSplit#url
 * @type {object} The video info
 */

/**
 * Data event
 * @event MediaSplit#data
 * @type {object[]} An array with the parsed sections
 */

/**
 * Emitted before a section is split
 * @event MediaSplit#beforeSplit
 * @param {object} Section info
 * @param {number} Index
 */

/**
 * Emitted after a section is split
 * @event MediaSplit#afterSplit
 * @param {object} Section info
 * @param {number} Index
 */

module.exports = MediaSplit
