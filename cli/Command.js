'use strict'

const MediaSplit = require('./../index.js')
const fs = require('fs')
const path = require('path')
const progress = require('cli-progress')

const log = console.log
const { green, cyan, red } = require('chalk')

class Command {
  constructor (argv) {
    this.argv = argv
  }

  getSections () {
    return this.argv.sections || this.readTemplateFile()
  }

  readTemplateFile () {
    try {
      const content = fs.readFileSync(this.argv.template, { enconding: 'utf-8' })
      return content.toString().trim().split('\n')
    } catch (e) {
      log(red(`Unable to open template file ${this.argv.template}`))
      return null
    }
  }

  parseMetadataInfo () {
    const meta = new Map()
    for (const data of this.argv.metadata) {
      const split = data.split('=')
      if (!split || split.length !== 2) {
        return null
      } else {
        meta.set(split[ 0 ], split[ 1 ])
      }
    }
    return meta
  }

  createDefaultProgressBar (opts = {}) {
    const options = Object.assign({
      clearOnComplete: true,
      stopOnComplete: true
    }, opts)
    return new progress.Bar(options, progress.Presets.shades_classic)
  }

  formatFiles (sections) {
    return ' - ' + sections.map((section) => cyan(section)).join(', ')
  }

  friendlyByteSize (size) {
    const megaByte = (size / 1024 / 1024).toFixed(1)
    return `${megaByte}MB`
  }

  run () {
    const sections = this.getSections()
    if (!sections) {
      log(red('No sections found. Unable to continue'))
      return
    }

    const metadata = this.parseMetadataInfo()
    if (metadata === null) {
      log(red('Wrong metadata input!'))
      return
    }

    const split = new MediaSplit({
      concurrency: this.argv.concurrency,
      input: this.argv.input,
      sections: sections,
      metadata: metadata,
      output: this.argv.output || '.',
      format: this.argv.format,
      audioonly: this.argv.audioonly,
      quality: this.argv.quality,
      inputParams: this.argv.inputParam,
      outputParams: this.argv.outputParam
    })

    let downloadBar
    let splitBar
    let currentSections = []

    split.on('data', (sections) => {
      splitBar = this.createDefaultProgressBar({
        format: 'Progress [{bar}] {percentage}% | {value}/{total} | Tracks{files}',
        stopOnComplete: false
      })
      splitBar.start(sections.length, 0, { files: '' })
    })

    split.on('beforeSplit', (info) => {
      currentSections.push(info.name)
      currentSections.sort()
      splitBar.update(splitBar.value, { files: this.formatFiles(currentSections) })
    })

    split.on('afterSplit', (info) => {
      currentSections = currentSections.filter((section) => section !== info.name)
      splitBar.increment(1, { files: this.formatFiles(currentSections) })
    })

    split.once('url', (file, info, cached) => {
      downloadBar = this.createDefaultProgressBar({
        format: 'Download [{bar}] {percentage}% | {friendlyValue} / {friendlyTotal}'
      })
      if (cached) {
        log(green('Found cached video on ') + cyan(path.resolve(file)))
      } else {
        log(green('Found video! saving to ') + cyan(path.resolve(file)))
      }
    })

    split.once('downloadLength', (total) => {
      downloadBar.start(total, 0, {
        friendlyValue: this.friendlyByteSize(0),
        friendlyTotal: this.friendlyByteSize(total)
      })
    })

    split.on('downloadProgress', (chunk) => {
      const value = downloadBar.value + chunk
      downloadBar.update(value, { friendlyValue: this.friendlyByteSize(value) })
    })

    split.parse().then(() => {
      splitBar.stop()
      log(green('Successfully parsed all files!'))
    }).catch((err) => {
      if (splitBar) splitBar.stop()
      if (downloadBar) downloadBar.stop()
      log(red(err.message))
    })
  }
}

module.exports = Command
