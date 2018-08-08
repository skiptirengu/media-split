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

const urlRe = /(?:http(?:s)?:\/\/.)?(?:www\.)?([-a-zA-Z0-9@:%._+~#=]){2,256}\.[a-z]{2,6}\b(?:[-a-zA-Z0-9@:%_+.~#?&/=]*)/g

// eslint-disable-next-line no-unused-vars
class MediaSplit extends EventEmitter {
  /**
   * @param {Object} options
   */
  constructor (options) {
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
      this._downloadOptions = {
        quality: 'highestaudio',
        filter: this._options.audioonly ? 'audioonly' : undefined
      }

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
      crypto.createHash('sha1').update(id).digest('hex'), format.container
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
    ytdl.downloadFromInfo(info, this._downloadOptions)
      .pipe(fs.createWriteStream(file))
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
          resolve(parseInt(response.headers['content-length']) === stat.size)
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
    return (typeof input === 'string') && input.match(urlRe)
  }

  _fileName (file, ext) {
    return sanitize(path.parse(file).name).toString().trim().concat(`.${ext}`)
  }

  _prepareInput () {
  }

  _parseMedia () {
  }

  _splitMedia () {
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
