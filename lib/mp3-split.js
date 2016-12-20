'use strict';
const fs = require('fs');
const path = require('path');
const sanitize = require('sanitize-filename');
const ytdl = require('ytdl-core');
const util = require('util');
const http = require('http');
const https = require('https');
const Stream = require('stream').Transform;
const EventEmitter = require('events').EventEmitter;
const spawnSync = require('child_process').spawnSync;

function isUrl(input) {
  let regexp = /(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g;
  return util.isString(input) && input.match(regexp);
}

function fileName(file) {
  return ''.concat(sanitize(file)).concat('.mp3');
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

function downloadCover(info, options) {
  fs.stat(options.coverName, (err) => {
    if (err) {
      let url = getCoverUrl(info);
      if (url) {
        let cb = res => {
          let data = new Stream();
          res.on('data', chunk => data.push(chunk));
          res.on('end', () => fs.writeFile(options.coverName, data.read()));
        };
        if (url.startsWith('https:')) https.get(url, cb);
        else http.get(url, cb);
      }
    }
  });
}

function prepareInput(options) {
  return new Promise((resolve, reject) => {
    if (isUrl(options.input)) {
      ytdl.getInfo(options.input, (err, info) => {
        if (err) {
          reject('Unable to download from video');
          return;
        }
        let fname = fileName(info.title);
        if (options.downloadCover) downloadCover(info, options);
        fs.stat(fname, (err) => {
          if (err) {
            let stream = ytdl.downloadFromInfo(info, {filter: 'audioonly'});
            stream.pipe(fs.createWriteStream(fname));
            stream.on('end', () => {
              resolve(options.coverName);
            });
            stream.on('error', () => {
              stream.abort();
              reject('An error has ocurred while downloading video');
            });
          } else {
            resolve(fname);
          }
        });
      });
    } else {
      fs.access(options.input, fs.constants.R_OK, (err) => {
        if (err) {
          reject(`Path "${options.input}" does not exist or file is not readable.`);
        } else {
          resolve(options.input);
        }
      })
    }
  });
}

function parseAudio(options) {
  return new Promise((resolve, reject) => {
    let periods = [];
    let split = options.audios;
    let thr = (line) => {
      throw new Error(`Unable to extract time info from ${line}`);
    };
    let removeBrackets = (str) => {
      return str ? str.toString().replace('[', '').replace(']', '') : str;
    };
    let extractTimeInfo = (str) => {
      let regex = /(^[\[]([\d]{1,2}[:])*[\d]{1,2}[:][\d]{1,2}([.][\d]{1,4})?[\]])+/g;
      let match = str.match(regex);
      return match === null ? match : match.pop();
    };
    try {
      split.forEach((startLine, idx) => {
        let start = extractTimeInfo(startLine);
        let end = null;
        if (start === null) thr(startLine);
        let nextIdx = idx + 1;
        if (nextIdx < split.length) {
          let endLine = split[nextIdx];
          end = extractTimeInfo(endLine);
          if (end === null) thr(endLine);
        }
        // remove time info from final filename
        let trackName = startLine.replace(start, '').trim();
        periods.push({
          name: fileName(trackName),
          start: removeBrackets(start),
          end: removeBrackets(end),
          trackName: trackName
        });
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
}

function splitAudio(file, data, emitter, options) {
  return new Promise((resolve, reject) => {
    let parsed = [];
    for (let audio of data) {
      let args = [
        '-hide_banner',
        '-loglevel', 'error',
        '-y',
        '-i', file,
        '-ss', audio.start,
      ];
      if (audio.end !== null) {
        args.push('-to', audio.end);
      }
      for (let meta of options.metadata) args.push('-metadata', `${meta.name}=${meta.value}`)
      args.push('-metadata', `title=${audio.trackName}`);
      args.push(audio.name);
      try {
        // TODO parallel ffmpeg spawn
        emitter.emit('beforeSplit', audio);
        spawnSync('ffmpeg', args, {stdio: [process.stdin, process.stdout, process.stderr]});
        parsed.push(audio.name);
        emitter.emit('afterSplit', parsed);
      } catch (ex) {
        reject(`An error has ocurred while parsing "${audio.name}"`);
        return;
      }
    }
    resolve(parsed);
  });
}

// default options
const defaults = {
  downloadCover: true,
  coverName: 'cover.jpg',
  metadata: [],
  audios: [],
  input: '',
};

/**
 * @param options
 * @return {Promise|Mp3Split}
 * @constructor
 */
function Mp3Split(options) {
  if (!(this instanceof Mp3Split)) return new Mp3Split(options);
  EventEmitter.call(this);
  let opts = Object.assign({}, defaults, options);
  let fname;
  let self = this;
  this.parse = function () {
    return prepareInput(opts)
    .then((file) => {
      fname = file;
      return parseAudio(opts)
    })
    .then((data) => {
      self.emit('data', data);
      return splitAudio(fname, data, self, opts)
    });
  };
}

util.inherits(Mp3Split, EventEmitter);
module.exports = Mp3Split;