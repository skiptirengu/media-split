#!/usr/bin/env node
'use strict';
const yargs = require('yargs');
const fs = require('fs');
const spawnSync = require('child_process').spawnSync;
const path = require('path');
const sanitize = require("sanitize-filename");
const colors = require('colors');

let argv = yargs.usage('Usage: $0 <command> [options]')
  .command('split', 'Split audio file')
  .example('$0 split -i audio.mp3 -t parse.txt', 'Split an audio file')
  .alias('t', 'template')
  .alias('i', 'input')
  .describe('i', 'Input audio file')
  .describe('t', 'Template text file')
  .default('t', 'templ.txt')
  .default('i', 'input.mp3')
  .help('h')
  .alias('h', 'help')
  .argv;

if (!fs.existsSync(argv.template)) {
  console.log('Template file is invalid!'.red);
  return -1;
}

if (!fs.existsSync(argv.input)) {
  console.log('Input file is invalid!'.red);
  return -1;
}

function buildTime(time) {
  return time.toString().replace('[', '').replace(']', '');
}

function parseTemplate() {
  return new Promise(resolve => {
    let periods = [];
    let stream = fs.createReadStream(argv.template, {encoding: 'utf-8', flags: 'r'});
    let regex = /(^[\[]([\d]{1,2}[:])*[\d]{1,2}[:][\d]{1,2}([.][\d]{1,4})?[\]])+/g;
    stream.on('data', buf => {
      let split = buf.toString().split('\n');
      split.forEach((line, idx) => {
        let def = {end: null};
        let match = line.match(regex)[0];
        def.start = buildTime(match);
        if (idx + 1 < split.length) {
          def.end = buildTime(split[idx + 1].match(regex)[0]);
        }
        def.name = sanitize(line.replace(match, '').trim()) + '.mp3';
        periods.push(def);
      });
    });
    stream.on('end', () => {
      periods.sort((a, b) => {
        if (a.start > b.start) return 1;
        if (a.start < b.start) return -1;
        return 0;
      });
      resolve(periods);
    });
  });
}

function splitAudio(data) {
  for (let audio of data) {
    let args = [];
    if (audio.end === null) {
      args = [
        '-hide_banner',
        '-loglevel', 'panic',
        '-i', argv.input,
        '-ss', audio.start,
        '-acodec',
        'copy',
        audio.name
      ];
    } else {
      args = [
        '-hide_banner',
        '-loglevel', 'panic',
        '-i', argv.input,
        '-ss', audio.start,
        '-to', audio.end,
        '-acodec',
        'copy',
        audio.name
      ];
    }
    console.log(`Parsing ${audio.name} starting at ${audio.start}...`.green);
    spawnSync('ffmpeg', args, {stdio: [process.stdin, process.stdout, process.stderr]});
    console.log(`Done!`.green);
  }
}

parseTemplate().then(splitAudio);