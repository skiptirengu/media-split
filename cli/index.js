#!/usr/bin/env node

'use strict'

const yargs = require('yargs')
const Command = require('./Command.js')

const argv = yargs
  .usage('Usage: $0 <command> [options]')
  .example('$0 -i myaudio.mp3 -t parse.txt -o /home/Music -m title=Test')
  .alias('a', 'audioonly')
  .alias('o', 'output')
  .alias('t', 'template')
  .alias('i', 'input')
  .alias('m', 'metadata')
  .alias('c', 'concurrency')
  .alias('f', 'format')
  .alias('s', 'sections')
  .describe('o', 'Output path')
  .describe('t', 'Template text file')
  .describe('i', 'Input file or YouTube URL')
  .describe('m', 'Output file metadata with "key=value" format')
  .describe('c', 'Max concurrent tasks')
  .describe('f', 'Output format (mp3, m4a, flac, etc)')
  .describe('a', 'Force download only audio files when using a url as input')
  .describe('s', 'Sections to split')
  .default('f', 'mp3')
  .default('t', 'templ.txt')
  .default('i', 'input.mp3')
  .default('a', false)
  .default('c', 3)
  .array('m').default('m', [])
  .array('s').default('s', null)
  .help('h').alias('h', 'help')
  .argv

new Command(argv).run()
