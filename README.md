# mp3-split

Split audio (and video) files

## Install

Make sure you have [ffmpeg](https://ffmpeg.org/) installed and added to your path then run:

```bash
npm install [-g] mp3-split
```

If you don't have ffmpeg installed, you can install [this package](https://www.npmjs.com/package/ffmpeg-binaries) which 
comes with a bundled ffmpeg, and media-split will automatically detect and use it.

```bash
npm install [-g] ffmpeg-binaries
```

## CLI

mp3-split comes with a built in CLI tool. Type `media-split -h` to list all options and see an usage example.
For input you can use either a YouTube link or a local file.

The template file format should be in the following format.
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

## Library

You can also use media-split as a library. Ex:

```js
let mp3Split = require('media-split');
let options = {input: 'myaudio.mp3', audios: ['[01:30] My audio']};
let split = mp3Split(options);
split.parse().then((sections) => {
  for (let section of sections) {
    console.log(section.name);      // filename
    console.log(section.start);     // section start
    console.log(section.end);       // section end
    console.log(section.trackName); // track name
  }
});
```
<a name="MediaSplit"></a>

## MediaSplit

- [mp3-split](#mp3-split)
  - [Install](#install)
  - [CLI](#cli)
  - [Library](#library)
  - [MediaSplit](#mediasplit)
    - [new MediaSplit(options)](#new-mediasplitoptions)
    - [mediaSplit.parse() ⇒ <code>Promise.&lt;Array.&lt;object&gt;&gt;</code>](#mediasplitparse-%E2%87%92-codepromiseltarrayltobjectgtgtcode)
    - ["url" (input, info, cached)](#%22url%22-input-info-cached)
    - ["data" (sections)](#%22data%22-sections)
    - ["beforeSplit" (info, index)](#%22beforesplit%22-info-index)
    - ["afterSplit" (info, index)](#%22aftersplit%22-info-index)
    - ["downloadProgress" (chunk, downloaded, total)](#%22downloadprogress%22-chunk-downloaded-total)
    - ["downloadLength" (length)](#%22downloadlength%22-length)
  - [License](#license)

<a name="new_MediaSplit_new"></a>

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

<a name="MediaSplit+parse"></a>

### mediaSplit.parse() ⇒ <code>Promise.&lt;Array.&lt;object&gt;&gt;</code>
Split the media

<a name="MediaSplit+event_url"></a>

### "url" (input, info, cached)
URL event. This event is emitted only once.

| Param | Type | Description |
| --- | --- | --- |
| input | <code>string</code> | The input file |
| info | <code>object</code> | The video info |
| cached | <code>boolean</code> | Whether the file was cached or not |

<a name="MediaSplit+event_data"></a>

### "data" (sections)
Data event. This event is emitted only once.

| Param | Type | Description |
| --- | --- | --- |
| sections | <code>Array.&lt;object&gt;</code> | Array with the parsed sections |

<a name="MediaSplit+event_beforeSplit"></a>

### "beforeSplit" (info, index)
Emitted before a section is split.

| Param | Type | Description |
| --- | --- | --- |
| info | <code>object</code> | Section info |
| index | <code>number</code> | Index |

<a name="MediaSplit+event_afterSplit"></a>

### "afterSplit" (info, index)
Emitted after a section is split.

| Param | Type | Description |
| --- | --- | --- |
| info | <code>object</code> | Section info |
| index | <code>number</code> | Section index |

<a name="MediaSplit+event_downloadProgress"></a>

### "downloadProgress" (chunk, downloaded, total)
Download progress.

| Param | Type | Description |
| --- | --- | --- |
| chunk | <code>number</code> | Chunk length in bytes |
| downloaded | <code>number</code> | Total downloaded in bytes |
| total | <code>number</code> | Total download length in bytes |

<a name="MediaSplit+event_downloadLength"></a>

### "downloadLength" (length)
Total download length. This event is emitted only once.

| Param | Type | Description |
| --- | --- | --- |
| length | <code>number</code> | Length in bytes |


## License

Licensed under the incredibly [permissive](http://en.wikipedia.org/wiki/Permissive_free_software_licence)
[MIT license](http://creativecommons.org/licenses/MIT/)
