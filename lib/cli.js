#!/usr/bin/env node
'use strict';
const mp3Split = require('./mp3-split');
const fs = require('fs');
const colors = require('colors');
const yargs = require('yargs');

let argv = yargs.usage('Usage: $0 <command> [options]')
.command('split', 'Split audio file')
.example('$0 split -i myaudio.mp3 -t parse.txt -m title=Test', 'Split an audio file')
.alias('t', 'template')
.alias('i', 'input')
.alias('m', 'metadata')
.array('m')
.describe('i', 'Input audio file')
.describe('m', 'Output file metadata with "key=value" format')
.describe('t', 'Template text file')
.default('t', 'templ.txt')
.default('i', 'input.mp3')
.default('m', [])
.help('h')
.alias('h', 'help').argv;

let content = '';
let stream = fs.createReadStream(argv.template, {encoding: 'utf-8', flags: 'r'});
stream.on('data', (buf) => {
  content += buf
});
stream.on('error', () => {
  console.log(`Unable to open template file ${argv.template}`.red);
});
stream.on('end', () => {
  let meta = [];
  for (let data of argv.metadata) {
    let split = data.split('=');
    if (!split || split.length !== 2) {
      console.log('Wrong metadata input!'.red);
      return;
    }
    meta.push({name: split[0], value: split[1]});
  }
  let audios = content.trim().split('\n');
  let split = new mp3Split({input: argv.input, audios: audios, metadata: meta});

  let beforeSplit = (info) => {
    console.log(`parsing ${info.name} starting at ${info.start}...`.green)
  };
  let afterSplit = () => {
    console.log('done!'.green)
  };
  split.on('beforeSplit', beforeSplit);
  split.on('afterSplit', afterSplit);
  let cleanup = () => {
    split.removeListener('beforeSplit', beforeSplit);
    split.removeListener('afterSplit', afterSplit);
  };

  split.parse().then(() => {
    cleanup();
    console.log('Successfully parsed all files!'.green);
  }).catch((err) => {
    cleanup();
    console.log(err.red);
  });
});