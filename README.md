# mp3-split

Split mp3 audio files

## Install

Make sure you have `ffmpeg` installed and run

```bash
npm install [-g] mp3-split
```

## CLI

mp3-split comes with a built in CLI tool. Type ```mp3-split -h``` to list all options and, see an usage example.

mp3-split expects a `.mp3` file or an youtube video link for input.

The template file format should be in the following format.
```
[time info ([hh:]mm:ss[.ms])] Name
```

Examaple:
```
[00:00] eli filosov [ p h i l o ] - oneofone_rwrk
[01:30] Swishers [SwuM x bsd.u]
[03:28] sweetbn _ i held you so close i forgot the world
[05:52] emune - Gretchen
[07:52] jhfly - sheets
[10:00] arbour - elusive
[11:30] tomppabeats - will you stay here with me
[12:40] tomppabeats - lonely but not when you hold me
[13:31] Bassti - To All The Ladys In The Place
[15:37] wish you still felt this way [ sophie meiers x 90sFlav ]
[18:04] quickly, quickly - getsomerest/sleepwell
[23:36] charlie toØ human - that "just got home from work" type of beat.
[25:37] jinsang - affection
[27:32] jhfly - girl
```

## Library

You can also use mp3-split as a library. Ex:

```js
let mp3Split = require('mp3-split');
let options = {input: 'myaudio.mp3', audios: ['[01:30] My audio']};
let split = mp3Split(options);
split.parse().then((parsedAudio) => {
  for (let audio of parsedAudio) {
    console.log(audio.name); // filename
    console.log(audio.start);  // audio start
    console.log(audio.end); // audio end
    console.log(audio.trackName); // track name
  }
});
```

You can also bind a listener to the following events.

```js
// emitted before splitting an audio file
mp3Split.on('beforeSplit', (audioInfo) => console.log(audioInfo));
// emitted after splitting an audio file
mp3Split.on('afterSplit', (parsedAudioFiles) => console.log(parsedAudioFiles));
// emitted when a video is found within the url given
mp3Split.on('url', (videoInfo) => console.log(videoInfo));
// emitted when the "audios" options is parsed and, before start to split the audio
mp3Split.on('data', (data) => console.log(data));
```

## License

Licensed under the incredibly [permissive](http://en.wikipedia.org/wiki/Permissive_free_software_licence)
[MIT license](http://creativecommons.org/licenses/MIT/)