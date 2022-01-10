# Media-split

[![Actions Status](https://github.com/skiptirengu/media-split/workflows/Node.js%20CI/badge.svg)](https://github.com/skiptirengu/media-split/actions)

Split audio (and video) files

## Install

Make sure you have [ffmpeg](https://ffmpeg.org/) installed and added to your path then run:

```bash
npm install [-g] media-split
```

If you don't have ffmpeg installed, you can install [this](https://www.npmjs.com/package/ffmpeg-static) or [this](https://www.npmjs.com/package/@ffmpeg-installer/ffmpeg) package which 
comes with a bundled ffmpeg, and media-split will automatically detect and use it.

```bash
npm install [-g] ffmpeg-static
```
or
```bash
npm install [-g] @ffmpeg-installer/ffmpeg
```

## CLI

media-split comes with a built in CLI tool. Type `media-split -h` to list all options and see an usage example.
For input you can use either a YouTube link or a local file.

The template file should be in the following format.
For more info, checkout [ffmpeg's duration syntax](https://ffmpeg.org/ffmpeg-utils.html#Time-duration) page.
```
[([hh:]mm:ss[.ms...]) [ - ([hh:]mm:ss[.ms...])]] My Music Name
```

A template file usually looks like this:
```
[00:00] eli filosov [ p h i l o ] - oneofone_rwrk
[01:30] Swishers [SwuM x bsd.u]
[03:28] sweetbn _ i held you so close i forgot the world
[05:52 - 07:49] emune - Gretchen
[07:52 - 09:50] jhfly - sheets
[10:00] arbour - elusive
[11:30] tomppabeats - will you stay here with me
[12:40] tomppabeats - lonely but not when you hold me
[13:31 - 15:30] Bassti - To All The Ladys In The Place
[15:37] wish you still felt this way [ sophie meiers x 90sFlav ]
```

## Known issues

Sometimes, when downloading videos from YouTube, media-split can fail with the error message "Too many redirects".
This is caused by a third party library and is already being tracked [here](https://github.com/fent/node-ytdl-core/issues/212).

## Library

You can also use media-split as a library.

```js
let MediaSplit = require('media-split');
let split = new MediaSplit({ input: 'myaudio.mp3', sections: ['[01:30] My audio'] });
split.parse().then((sections) => {
  for (let section of sections) {
    console.log(section.name);      // filename
    console.log(section.start);     // section start
    console.log(section.end);       // section end
    console.log(section.trackName); // track name
  }
});
```

### new MediaSplit(options)
**Returns**: MediaSplit  

| Param | Type | Description |
| --- | --- | --- |
| options | <code>object</code> |  |
| options.downloadCover | <code>boolean</code> | Whether to download the cover from the YouTube video |
| options.input | <code>string</code> | The input file. Can be either a file path or a YouTube url |
| options.concurrency | <code>number</code> | Number of parallel workers MediaSplit will spawn at once |
| options.sections | <code>Array.&lt;string&gt;</code> | Sections to extract from the input source. Supported formats are `[01:30 - 03:50] File` or `[01:30] File` |
| options.output | <code>string</code> | Output path |
| options.format | <code>string</code> | Output format (mp3, m4a, flac, etc) |
| options.audioonly | <code>boolean</code> | Force download only audio files when using a url as input |
| options.quality | <code>string</code> | The download quality when downloading from YouTube (highest/lowest/highestaudio/lowestaudio/highestvideo/lowestvideo) |
| options.inputParams | <code>Array.&lt;string&gt;</code> | Additional input parameters for FFMpeg
| options.outputParams | <code>Array.&lt;string&gt;</code> | Additional output parameters for FFMpeg

### MediaSplit.parse() ⇒ <code>Promise.&lt;Array.&lt;object&gt;&gt;</code>
Split the media

### "url" (input, info, cached)
URL event. This event is emitted only once.

| Param | Type | Description |
| --- | --- | --- |
| input | <code>string</code> | The input file |
| info | <code>object</code> | The video info |
| cached | <code>boolean</code> | Whether the file was cached or not |

### "data" (sections)
Data event. This event is emitted only once.

| Param | Type | Description |
| --- | --- | --- |
| sections | <code>Array.&lt;object&gt;</code> | Array with the parsed sections |

### "beforeSplit" (info, index)
Emitted before a section is split.

| Param | Type | Description |
| --- | --- | --- |
| info | <code>object</code> | Section info |
| index | <code>number</code> | Index |

### "afterSplit" (info, index)
Emitted after a section is split.

| Param | Type | Description |
| --- | --- | --- |
| info | <code>object</code> | Section info |
| index | <code>number</code> | Section index |

### "downloadProgress" (chunk, downloaded, total)
Download progress.

| Param | Type | Description |
| --- | --- | --- |
| chunk | <code>number</code> | Chunk length in bytes |
| downloaded | <code>number</code> | Total downloaded in bytes |
| total | <code>number</code> | Total download length in bytes |

### "downloadLength" (length)
Total download length. This event is emitted only once.

| Param | Type | Description |
| --- | --- | --- |
| length | <code>number</code> | Length in bytes |

## License

Licensed under the incredibly [permissive](http://en.wikipedia.org/wiki/Permissive_free_software_licence)
[MIT license](http://creativecommons.org/licenses/MIT/)
