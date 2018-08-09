'use strict'

const sanitize = require('sanitize-filename')
const ytdl = require('ytdl-core')

const EventEmitter = require('events').EventEmitter
const util = require('util')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const http = require('http')
const https = require('https')
const url = require('url')
const spawn = require('child_process').spawn

const urlRe = /(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_+.~#?&/=]*)/g
const timeRe = /(^[\[]([\d]{1,2}[:])*[\d]{1,2}[:][\d]{1,2}([.][\d]{1,4})?[\]])+/g

// eslint-disable-next-line no-unused-vars
class MediaSplit extends EventEmitter {
  /**
   * @param {Object} options
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
      coverName: 'cover.jpg',
      format: 'mp3',
      audioonly: false
    }

    Object.defineProperty(defaults, 'audios', {
      set: util.deprecate(function (data) {
        this.sections = data
      }, '"audios" property is deprecated. Use the property "sections" instead.', 'mp3-split'),
      get () {
        return this.sections
      }
    })

    this._options = Object.assign(defaults, options)
    this._fileTitle = ''
    this._inputFile = ''
    this._downloadOptions = {}
  }

  parse () {
    return this._checkDirectory(this._options.output)
      .then(() => this._handleInput())
      .then(() => this._parseMedia())
      .then(() => this._splitMedia())
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

      this._fileTitle = info.title
      this._inputFile = path.join(this._options.output, this._generateFilename(format, info.vid))

      this.emit('url', this._inputFile, info)

      if (this._options.downloadCover) {
        this._downloadCover()
      }

      return this._checkDownloadCache(format, info)
    })
  }

  _generateFilename (format, id) {
    return this._fileName(
      crypto.createHash('md5').update(id).digest('hex'), format.container
    )
  }

  _checkDownloadCache (format, info) {
    const file = this._downloadOptions

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
          return this._downloadFile(info)
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
      const reqLib = ytUrl.startsWith('https') ? https : http
      const parsed = url.parse(ytUrl)
      parsed.method = 'HEAD'
      reqLib.request(parsed, (response) => {
        if (!(response.statusCode >= 200 && response.statusCode < 300)) {
          resolve(false)
        } else {
          resolve(parseInt(response.headers[ 'content-length' ]) === stat.size)
        }
      })
    })
  }

  _downloadCover () {
    this.emit('warning', 'Unable to download')
  }

  _handleFile () {
    return Promise.resolve()
  }

  _isUrl (input) {
    return (typeof input === 'string') && !!input.match(urlRe)
  }

  _fileName (file, ext) {
    return sanitize(path.parse(file).name).toString().trim().concat(`.${ext}`)
  }

  _prepareInput () {
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

      const start = this._extractTimeInfo(curr)
      if (start === null) {
        throw new Error(`Unable to extract start time from line ${line}`)
      }

      let end = null
      if (line < sections.length) {
        end = this._extractTimeInfo(sections[ line ])
        if (end === null) {
          throw new Error(`Unable to extract end time from line ${line + 1}`)
        }
      }

      // remove time info from final filename
      const trackName = curr.replace(start, '').trim()
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
    return str ? str.toString().replace('[', '').replace(']', '') : str
  }

  _extractTimeInfo (str) {
    const match = str.match(timeRe)
    return match === null ? match : match.pop()
  }

  _splitMedia (sections) {
    const binFFmpeg = require('./FFmpeg.js')

    if (!binFFmpeg) {
      return Promise.reject('Unable to spawn FFmpeg\'s process. Make sure it installed and available on your path')
    }

    // Number of tasks in execution
    let concurrentTasks = 0
    let maxTasks = this._options.concurrency

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
          if (concurrentTasks <= maxTasks) {
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
        throw new Error(`Output path ${dir} is not a directory`)
      }
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

module.exports = MediaSplit
