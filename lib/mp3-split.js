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
const spawn = require('child_process').spawn;
const spawnSync = require('child_process').spawnSync;

function isUrl(input) {
  const regexp = /(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_+.~#?&//=]*)/g;
  return (typeof input === 'string') && input.match(regexp);
}

function fileName(file, ext) {
  return sanitize(path.parse(file).name).toString().trim().concat(`.${ext}`);
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
  const dir = path.join(options.output, options.coverName);
  fs.stat(dir, (err) => {
    if (err) {
      const url = getCoverUrl(info);
      if (url) {
        const cb = res => {
          const data = new Stream();
          res.on('data', chunk => data.push(chunk));
          res.on('end', () => fs.writeFile(dir, data.read()));
        };
        if (url.startsWith('https:')) {
          https.get(url, cb);
        } else {
          http.get(url, cb);
        }
      }
    }
  });
}

function prepareInput(emitter, options) {
  return new Promise((resolve, reject) => {
    try {
      const stat = fs.statSync(options.output);
      if (!stat.isDirectory()) {
        reject('Output path is not a directory');
        return;
      }
    } catch (ex) {
      reject('Output path does not exist');
      return;
    }

    if (isUrl(options.input)) {
      ytdl.getInfo(options.input, (err, info) => {
        if (err) {
          return reject('Unable to download from video');
        }
        const downloadOptions = {
          quality: 'highestaudio',
          filter: options.audioonly ? 'audioonly' : undefined
        };
        const format = ytdl.chooseFormat(info.formats, downloadOptions);
        if ((format instanceof Error) || !format.container) {
          return reject('Unable to find a suitable video format');
        }
        const fname = path.join(options.output, fileName(info.title, format.container));
        emitter.emit('url', fname, info);
        if (options.downloadCover) {
          downloadCover(info, options);
        }
        fs.stat(fname, (err) => {
          if (err) {
            const stream = ytdl.downloadFromInfo(info, downloadOptions);
            stream.pipe(fs.createWriteStream(fname));
            stream.on('end', () => resolve(fname));
            stream.on('abort', () => reject('An error has ocurred while downloading video'));
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
      });
    }
  });
}

function resolveFormat(options) {
  if (options.format) {
    return options.format.replace('.', '');
  } else {
    return 'mp3';
  }
}

function parseAudio(options) {
  return new Promise((resolve, reject) => {
    const periods = [];
    const split = options.sections;
    const thr = (line) => {
      throw new Error(`Unable to extract time info from ${line}`);
    };
    const removeBrackets = (str) => {
      return str ? str.toString().replace('[', '').replace(']', '') : str;
    };
    const extractTimeInfo = (str) => {
      const regex = /(^[\[]([\d]{1,2}[:])*[\d]{1,2}[:][\d]{1,2}([.][\d]{1,4})?[\]])+/g;
      const match = str.match(regex);
      return match === null ? match : match.pop();
    };
    try {
      split.forEach((startLine, idx) => {
        const start = extractTimeInfo(startLine);
        let end = null;
        if (start === null) {
          thr(startLine);
        }
        const nextIdx = idx + 1;
        if (nextIdx < split.length) {
          const endLine = split[nextIdx];
          end = extractTimeInfo(endLine);
          if (end === null) {
            thr(endLine);
          }
        }
        // remove time info from final filename
        const trackName = startLine.replace(start, '').trim();
        periods.push({
          name: fileName(trackName, resolveFormat(options)),
          start: removeBrackets(start),
          end: removeBrackets(end),
          trackName: trackName
        });
      });
    } catch (err) {
      reject(err.message);
      return;
    }
    periods.sort((a, b) => a.start - b.start);
    resolve(periods);
  });
}

function chooseffmpeg() {
  if (!(spawnSync('ffmpeg').error instanceof Error)) {
    return 'ffmpeg';
  }
  const global = require('global-modules');
  const library = 'ffmpeg-binaries';
  for (const lib of [library, path.join(global, library)]) {
    try {
      return require(lib);
    } catch (e) {
      //
    }
  }
  return null;
}

function splitAudio(file, data, emitter, options) {
  const ffmpegBin = chooseffmpeg();
  if (!ffmpegBin) {
    return Promise.reject('Unable to spawn ffmpeg\'s process. Make sure it installed and available on your path.');
  }
  let concurrentTasks = 0;
  return Promise.all(
    data.map((audio, index) => {
      return new Promise((resolve, reject) => {
        const args = [
          '-hide_banner',
          '-loglevel', 'repeat+error',
          '-y',
          '-i', file,
          '-ss', audio.start,
        ];
        // default args
        if (audio.end !== null) {
          args.push('-to', audio.end);
        }
        for (const meta of options.metadata) {
          args.push('-metadata', `${meta.name}=${meta.value}`);
        }
        args.push('-metadata', `title=${audio.trackName}`);
        args.push('-metadata', `track=${index + 1}`);
        args.push(path.join(options.output, audio.name));
        // spawn async
        const interval = setInterval(() => {
          if (concurrentTasks >= options.concurrency) {
            return;
          }
          clearInterval(interval);
          concurrentTasks++;
          emitter.emit('beforeSplit', audio);
          spawn(ffmpegBin, args, { stdio: ['ignore', process.stdout, process.stderr] })
            .on('error', (err) => {
              concurrentTasks--;
              reject(err);
            })
            .on('close', () => {
              emitter.emit('afterSplit', audio);
              concurrentTasks--;
              resolve(audio);
            });
        }, 1000);
      });
    })
  );
}

/**
 * @param options
 * @return {Promise|Mp3Split}
 * @constructor
 */
function Mp3Split(options) {
  if (!(this instanceof Mp3Split)) {
    return new Mp3Split(options);
  }
  EventEmitter.call(this);

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
    audioonly: false,
  };

  Object.defineProperty(defaults, 'audios', {
    set: util.deprecate(function (data) {
      this.sections = data;
    }, '"audios" property is deprecated. Use the property "sections" instead.', 'mp3-split'),
    get() {
      return this.sections;
    }
  });

  const opts = Object.assign(defaults, options);
  const self = this;
  this.parse = function () {
    return prepareInput(self, opts)
      .then((file) => {
        return Promise.all([parseAudio(opts), file]);
      })
      .then(([data, file]) => {
        self.emit('data', data);
        return splitAudio(file, data, self, opts);
      });
  };
}

util.inherits(Mp3Split, EventEmitter);
module.exports = Mp3Split;
