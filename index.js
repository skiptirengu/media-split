#!/usr/bin/env node
'use strict';
const yargs = require('yargs');
const fs = require('fs');
const spawnSync = require('child_process').spawnSync;
const path = require('path');
const sanitize = require("sanitize-filename");
const colors = require('colors');
const ytdl = require('ytdl-core');
const isString = require('util').isString;
const http = require('http');
const https = require('https');
const Stream = require('stream').Transform;

let argv = yargs.usage('Usage: $0 <command> [options]')
  .command('split', 'Split audio file')
  .example('$0 split -i audio.mp3 -t parse.txt', 'Split an audio file')
  .alias('t', 'template')
  .alias('i', 'input')
  .alias('c', 'artist')
  .alias('a', 'album')
  .describe('i', 'Input audio file')
  .describe('t', 'Template text file')
  .describe('c', 'Artist name')
  .describe('a', 'Album name')
  .default('t', 'templ.txt')
  .default('i', 'input.mp3')
  .default('c', 'unknown')
  .default('a', 'unknown')
  .help('h')
  .alias('h', 'help')
  .argv;

const isUrl = !!(!!argv.input && ("" + argv.input).match(/(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g));

if (!fs.existsSync(argv.template)) {
  console.log('Template file is invalid!'.red);
  return;
}

if (!isUrl && !fs.existsSync(argv.input)) {
  console.log('Input file is invalid!'.red);
  return;
}

function buildTime(time) {
  return !isString(time) ? time : time.replace('[', '').replace(']', '');
}

function getCoverUrl(info) {
  if (info.iurlmaxres) {
    return info.iurlmaxres;
  } else if (info.iurlsd) {
    return info.iurlsd;
  } else if (info.iurlhq) {
    return info.iurlhq;
  } else {
    return null;
  }
}

function prepareFile() {
  return new Promise((resolve, reject) => {
    if (isUrl) {
      console.log('Url detected, searching video...'.green);
      ytdl.getInfo(argv.input, (err, info) => {
        if (err) {
          reject('Unable to download video');
        } else {
          let fname = sanitize(info.title) + ".mp3";
          let cover = getCoverUrl(info);
          if (isString(cover) && !fs.existsSync('cover.jpg')) {
            let cb = res => {
              let data = new Stream();
              res.on('data', chunk => data.push(chunk));
              res.on('end', () => fs.writeFile('cover.jpg', data.read()));
            };
            if (cover.startsWith('https:')) {
              https.get(cover, cb);
            } else {
              http.get(cover, cb);
            }
          }
          if (!fs.existsSync(fname)) {
            console.log(`Video found! Saving to ${fname}.`.green);
            let stream = ytdl.downloadFromInfo(info, {filter: 'audioonly'});
            stream.pipe(fs.createWriteStream(fname));
            stream.on('end', () => resolve(fname));
          } else {
            console.log(`${fname} already exists! Using local version...`.green);
            resolve(fname);
          }
        }
      });
    } else {
      resolve(argv.input);
    }
  });
}

function matchTime(str) {
  let regex = /(^[\[]([\d]{1,2}[:])*[\d]{1,2}[:][\d]{1,2}([.][\d]{1,4})?[\]])+/g;
  let match = str.match(regex);
  return match === null ? match : match.pop();
}

function parseTemplate() {
  return new Promise((resolve, reject) => {
    let periods = [];
    let stream = fs.createReadStream(argv.template, {encoding: 'utf-8', flags: 'r'});
    let content = '';
    stream.on('data', buf => content += buf);
    stream.on('end', () => {
      let split = content.toString().trim().split('\n');
      try {
        split.forEach((line, idx) => {
          let start = matchTime(line);
          if (start === null) throw new Error(`Wrongly formatted template file at line ${idx + 1}`);
          let end = null;
          let nextIdx = idx + 1;
          if (nextIdx < split.length) {
            end = matchTime(split[nextIdx]);
            if (end === null) throw new Error(`Wrongly formatted template file at line ${nextIdx + 1}`);
          }
          // remove time info from filename
          let trackName = line.replace(start, '').trim();
          let name = sanitize(trackName) + '.mp3';
          start = buildTime(start);
          end = buildTime(end);
          periods.push({name: name, start: start, end: end, trackName: trackName});
        });
      } catch (err) {
        reject(err.message);
        return;
      }
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
  //TODO metadata for youtube audio (non acodec)
  for (let audio of data) {
    let args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', argv.input,
      '-ss', audio.start,
      '-to', audio.end,
      '-metadata', `artist=${argv.artist}`,
      '-metadata', `album_artist=${argv.artist}`,
      '-metadata', `album=${argv.album}`,
      '-metadata', `title=${audio.trackName}`,
      audio.name
    ];
    if (audio.end === null) {
      args = [
        '-hide_banner',
        '-loglevel', 'error',
        '-i', argv.input,
        '-ss', audio.start,
        '-metadata', `artist=${argv.artist}`,
        '-metadata', `album_artist=${argv.artist}`,
        '-metadata', `album=${argv.album}`,
        '-metadata', `title=${audio.trackName}`,
        audio.name
      ];
    }
    console.log(`Parsing ${audio.name} starting at ${audio.start}...`.green);
    spawnSync('ffmpeg', args, {stdio: [process.stdin, process.stdout, process.stderr]});
    console.log(`Done!`.green);
  }
}

prepareFile().then(input => {
  argv.input = input;
  return Promise.resolve();
}).then(parseTemplate)
  .then(splitAudio)
  .catch(err => console.log(err.red));