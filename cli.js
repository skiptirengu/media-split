#!/usr/bin/env node

'use strict'

const MediaSplit = require('./index.js')
const fs = require('fs')
const yargs = require('yargs')
const chalk = require('chalk')
const log = console.log

const argv = yargs.usage('Usage: $0 <command> [options]')
  .example('$0 -i myaudio.mp3 -t parse.txt -o /home/Music -m title=Test')
  .alias('a', 'audioonly')
  .alias('o', 'output')
  .alias('t', 'template')
  .alias('i', 'input')
  .alias('m', 'metadata')
  .alias('c', 'concurrency')
  .alias('f', 'format')
  .describe('o', 'Output path')
  .describe('t', 'Template text file')
  .describe('i', 'Input file or YouTube URL')
  .describe('m', 'Output file metadata with "key=value" format')
  .describe('c', 'Max concurrent tasks')
  .describe('f', 'Output format (mp3, m4a, flac, etc)')
  .describe('a', 'Force download only audio files when using a url as input')
  .default('f', 'mp3')
  .default('t', 'templ.txt')
  .default('i', 'input.mp3')
  .default('a', false)
  .default('c', 3)
  .array('m').default('m', [])
  .help('h').alias('h', 'help')
  .argv

runCommand()

function runCommand () {
  let content, sections, split

  try {
    content = fs.readFileSync(argv.template, { enconding: 'utf-8' })
  } catch (e) {
    log(chalk.red(`Unable to open template file ${argv.template}`))
    return
  }

  sections = content.trim().split('\n')

  const meta = []
  for (const data of argv.metadata) {
    const split = data.split('=')
    if (!split || split.length !== 2) {
      console.log('Wrong metadata input!'.red)
      return
    } else {
      meta.push({ name: split[ 0 ], value: split[ 1 ] })
    }
  }

  split = new MediaSplit({
    concurrency: argv.concurrency,
    input: argv.input,
    sections: sections,
    metadata: meta,
    output: argv.output || '.',
    format: argv.format,
    audioonly: argv.audioonly
  })

  split
    .on('beforeSplit', (info) => {
      log(
        chalk.green('Parsing ') + chalk.cyan(info.name) + chalk.green(' starting at ') + chalk.cyan(info.start) + chalk.green('...')
      )
    })
    .on('afterSplit', (info) => {
      log(
        chalk.green('Successfully parsed ') + chalk.cyan(info.name) + chalk.green('!')
      )
    })
    .on('url', (file) => {
      log(
        chalk.green('Found video! saving to ') + chalk.cyan(file)
      )
    })
    .parse()
    .then(() => {
      log(
        chalk.green('Successfully parsed all files!')
      )
    })
    .catch((err) => {
      log(
        chalk.red(err.message)
      )
    })
}
