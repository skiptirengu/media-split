#!/usr/bin/env node

'use strict';

const mp3Split = require('./mp3-split');
const fs = require('fs');
const yargs = require('yargs');
const colors = require('colors');

const argv = yargs.usage('Usage: $0 <command> [options]')
  .command('split', 'Split audio file')
  .example('$0 split -i myaudio.mp3 -t parse.txt -o /home/Music -m title=Test')
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
  .array('m')
  .default('m', [])
  .help('h')
  .alias('h', 'help').argv;

let content = '';
const stream = fs.createReadStream(argv.template, { encoding: 'utf-8', flags: 'r' });
stream.on('data', (buf) => content += buf);
stream.on('error', () => console.log(`Unable to open template file ${argv.template}`.red));
stream.on('end', () => {
  const meta = [];
  for (const data of argv.metadata) {
    const split = data.split('=');
    if (!split || split.length !== 2) {
      console.log('Wrong metadata input!'.red);
      return;
    }
    meta.push({ name: split[0], value: split[1] });
  }
  const sections = content.trim().split('\n');
  const split = new mp3Split({
    concurrency: argv.concurrency,
    input: argv.input,
    sections: sections,
    metadata: meta,
    output: argv.output || '.',
    format: argv.format,
    audioonly: argv.audioonly
  });
  split.on('beforeSplit', info => {
    console.log(
      colors.green('Parsing ') + colors.cyan(info.name) + colors.green(' starting at ') + colors.cyan(info.start) + colors.green('...')
    );
  });
  split.on('afterSplit', info => {
    console.log(
      colors.green('Successfully parsed ') + colors.cyan(info.name) + colors.green('!')
    );
  });
  split.on('url', file => {
    console.log(
      colors.green('Found video! saving to ') + colors.cyan(file)
    );
  });
  split.parse().then(() => console.log('Successfully parsed all files!'.green)).catch(err => console.log(err.red));
});
