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
const request = require('miniget')

const urlRe = /(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_+.~#?&/=]*)/g
const hasTimeRe = /\[[.:\d]+([ \t]+-[ \t]+[.:\d]+)?]/g
const timeRe = /(^\[([\d]{1,2}[:])*[\d]{1,2}[:][\d]{1,2}([.][\d]{1,4})?])+/g

class MediaSplit extends EventEmitter {
  /**
   * @param {object} options
   * @param {boolean} options.downloadCover - Whether to download the cover from the YouTube video
   * @param {string} options.input - The input file. Can be either a file path or a YouTube url
   * @param {number} options.concurrency - Number of parallel workers MediaSplit will spawn at once
   * @param {string[]} options.sections - Sections to extract from the input source.
   * The section should be specified in one of the following formats `[01:30 - 03:50] File` or `[01:30] File`
   * @param {string} options.output - Output path
   * @param {string} options.format - Output format (mp3, m4a, flac, etc)
   * @param {boolean} options.audioonly - Force download only audio files when using a url as input
   * @param {string} options.quality - Download quality
   * @param {string[]} options.inputParams - FFMpeg additional input parameters
   * @param {string[]} options.outputParams - FFMpeg additional output parameters
   * @return MediaSplit
   */
  constructor (options = {}) {
    super()

    // default options
    const defaults = {
      downloadCover: true,
      input: '',
      concurrency: this._optimalNumberOfWorkers(),
      metadata: new Map(),
      sections: [],
      output: '.',
      format: 'mp3',
      audioonly: false,
      quality: 'highest',
      inputParams: [],
      outputParams: []
    }

    this._options = Object.assign(
      defaults,
      options,
      {
        inputParams: this._sanitizeParams(options.inputParams),
        outputParams: this._sanitizeParams(options.outputParams)
      }
    )

    this._inputFile = ''
    this._downloadOptions = {}
  }

  /**
   * Split the media
   *
   * @return {Promise<Array<object>>}
   */
  parse () {
    return this._checkDirectory(this._options.output)
      .then(() => this._handleInput())
      .then(() => this._parseMedia())
      .then((sections) => this._splitMedia(sections))
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
      this._downloadOptions = { quality: this._options.quality, filter: this._options.audioonly ? 'audioonly' : undefined }

      const format = ytdl.chooseFormat(info.formats, this._downloadOptions)

      if ((format instanceof Error)) {
        throw format
      } else if (!format.container) {
        throw new Error('Could not find a suitable download format')
      }

      this._inputFile = path.join(
        this._options.output, this._fileName(info.videoDetails.title, format.container)
      )

      return Promise.all([
        this._checkDownloadCache(format, info),
        this._downloadCover(info)
      ])
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
          .then((valid) => {
            if (valid) {
              this.emit('url', this._inputFile, info, true)
              return Promise.resolve(file)
            } else {
              return this._downloadFile(info, file)
            }
          })
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
    this.emit('url', this._inputFile, info, false)

    return new Promise((resolve, reject) => {
      let downloadLen
      ytdl.downloadFromInfo(info, this._downloadOptions)
        .on('progress', (chunk, downloaded, total) => {
          total = parseInt(total)
          if (!downloadLen) {
            this.emit('downloadLength', downloadLen = total)
          }
          this.emit('downloadProgress', chunk, downloaded, total)
        })
        .pipe(fs.createWriteStream(file))
        .once('finish', resolve)
        .once('error', reject)
    })
  }

  _checkCachedFileIsValid (stat, ytUrl) {
    return new Promise((resolve) => {
      const reqLib = this._getReqLib(ytUrl)
      const parsed = new url.URL(ytUrl)
      parsed.method = 'HEAD'
      const req = reqLib.request(parsed, (response) => {
        if (!this._isResponseSuccessful(response)) {
          resolve(false)
        } else {
          resolve(parseInt(response.headers[ 'content-length' ]) === stat.size)
        }
      })
      req.on('error', () => resolve(false))
      req.end()
    })
  }

  _isResponseSuccessful (response) {
    return response.statusCode >= 200 && response.statusCode < 300
  }

  _getReqLib (ytUrl) {
    return ytUrl.startsWith('https') ? https : http
  }

  _downloadCover (info) {
    if (!this._options.downloadCover) {
      return Promise.resolve(true)
    }

    const url = `https://img.youtube.com/vi/${info.videoDetails.videoId}/sddefault.jpg`
    return new Promise((resolve) => {
      const outputFile = path.join(this._options.output, 'cover.jpg')
      request(url)
        .once('end', () => resolve(true))
        .once('error', () => resolve(false))
        .pipe(fs.createWriteStream(outputFile))
    })
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
    return sanitize(path.parse(file).base).toString().trim().concat(`.${ext}`)
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

    for (const index in sections) {
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
        const time = this._extractTimeRangeFromLine(sections[ line ])

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
    const [ start, end ] = this._removeBrackets(period).split('-')
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
    const maxTasks = this._options.concurrency

    this.emit('data', sections)

    const promises = sections.map((section, index) => {
      return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
          // keep executing until one of the workers is done
          if (concurrentTasks >= maxTasks) {
            return
          }

          // remove this worker from the queue
          clearInterval(interval)
          concurrentTasks++

          const args = [
            '-hide_banner',
            '-loglevel', 'repeat+error',
            '-y',
            ...this._options.inputParams,
            '-i', this._inputFile,
            '-ss', section.start
          ]

          // section end
          if (section.end !== null) {
            args.push('-to', section.end)
          }

          section.metadata = new Map(this._options.metadata)
          // Allow the user to modify the metadata
          this.emit('beforeSplit', section, index)

          if (!section.metadata.has('title')) {
            section.metadata.set('title', section.trackName)
          }
          if (!section.metadata.has('track')) {
            section.metadata.set('track', index + 1)
          }

          // Add metadata info to the arguments
          for (const meta of section.metadata) {
            const [ name, value ] = meta
            args.push('-metadata', `${name}=${value}`)
          }

          // Additional ffmpeg output arguments
          args.push(...this._options.outputParams)

          // And finally the output path
          args.push(path.join(this._options.output, section.name))

          const proc = spawn(binFFmpeg, args, { stdio: [ 'ignore', process.stdout, process.stderr ] })
          proc.once('error', (err) => {
            concurrentTasks--
            reject(err)
          })
          proc.once('close', () => {
            this.emit('afterSplit', section, index)
            concurrentTasks--
            resolve(section)
          })
        }, 1000)
      })
    })

    return Promise.all(promises)
  }

  /**
   * @param {string[]} params
   */
  _sanitizeParams (params) {
    return (params || [])
      .map((x) => x.replace(/^("|')/gim, '').replace(/("|')$/gim, ''))
      .flatMap(x => x.split(' '))
  }

  _checkAccess (dir, mode) {
    return new Promise((resolve, reject) => fs.access(dir, mode, (err) => err ? reject(err) : resolve(dir)))
  }

  /**
   * @param {string} dir
   * @return {Promise<object>}
   * @private
   */
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

  _optimalNumberOfWorkers () {
    const cpus = require('os').cpus().length - 1
    if (cpus <= 1) {
      return 1
    } else {
      return cpus
    }
  }
}

/**
 * URL event. This event is emitted only once.
 * @event MediaSplit#url
 * @param {string} input - The input file
 * @param {object} info - The video info
 * @param {boolean} cached - Whether the file was cached or not
 */

/**
 * Data event. This event is emitted only once.
 * @event MediaSplit#data
 * @param {object[]} sections - Array with the parsed sections
 */

/**
 * Emitted before a section is split.
 * @event MediaSplit#beforeSplit
 * @param {object} info - Section info
 * @param {number} index - Index
 */

/**
 * Emitted after a section is split.
 * @event MediaSplit#afterSplit
 * @param {object} info - Section info
 * @param {number} index - Section index
 */

/**
 * Download progress.
 * @event MediaSplit#downloadProgress
 * @param {number} chunk - Chunk length in bytes
 * @param {number} downloaded - Total downloaded in bytes
 * @param {number} total - Total download length in bytes
 */

/**
 * Total download length. This event is emitted only once.
 * @event MediaSplit#downloadLength
 * @param {number} length - Length in bytes
 */

module.exports = MediaSplit
