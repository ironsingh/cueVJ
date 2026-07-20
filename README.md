# cueVJ

**A web-native live-visuals framework.** Mic in, vectors out. VJ from a browser tab.

Live visuals today mean TouchDesigner, Resolume, or Notch: downloads, licenses, GPU requirements,
and a learning curve measured in months. cueVJ is a URL. Open it, let it hear your music, and
scroll. That's the whole instrument.

> **[Try the demo at cuevj.com](https://cuevj.com)**

Built by **Ronny Singh**.

---

## What it is

cueVJ paints the whole viewport with generative line art, using pure SVG. No canvas, no WebGL, no
shaders. It's driven by a single normalized **signal bus**, and anything can feed that bus: a live
microphone, an audio file, MIDI, scroll position, the pointer, or a self-driving clock so the
visuals never sit still even with no input at all.

**Scenes** are small generators that draw into an SVG layer and react to the signal every frame.
A **director** cross-fades between them along a timeline that advances by time, by beat, or, in the
mode that makes this feel like an instrument, by **scroll**. Scrubbing the page *is* the performance.

20 scenes ship today, from geometric (`tunnel`, `grid`, `terrain`, `lasers`) to hand-drawn
(`contour`, `ideate`, `think`).

## Why

I'm a software developer working on the creative and visuals side, and I kept running into the same
wall. The tools that make great live visuals are heavy. They assume you'll invest weeks before you
make anything worth showing. I wanted the opposite: something plug and play, where a musician, a DJ,
or anyone playing a track at home could have real reactive visuals in about five seconds, with no
install and no ramp-up.

cueVJ is that idea, built as a framework rather than an app. The demo is one way to drive it, not
the only way.

## Quick start

No build step, no dependencies. Drop in a script tag and go.

```html
<div id="stage"></div>
<script src="cuevj.js"></script>
<script>
  const app = cueVJ.create({
    mount: '#stage',
    background: '#06070a',
    palette: ['#f3a93c', '#5fe3d4', '#ff4f8b', '#9b7bff'],
    scenes: [cueVJ.scenes.emerge(), cueVJ.scenes.flow(), cueVJ.scenes.lissa()],
    story: ['emerge', 'flow', 'lissa'],
    storyMode: 'scroll'          // 'time' | 'scroll' | 'beat'
  });

  app.use(cueVJ.sources.demo());  // self-drives until real audio arrives
  app.useScroll();
  app.bind('flow.speed', s => 0.6 + s.energy * 1.4);   // react to the signal bus
  app.start();
</script>
```

Add live audio on a user gesture, which browsers require:

```js
button.addEventListener('click', () => app.useAudioMic());
```

### The signal bus

Every scene binding receives one normalized object:

| Field | What it is |
|---|---|
| `energy`, `bass`, `mid`, `treble` | Normalized band levels, 0 to 1 |
| `beat`, `bpm` | Beat pulse and detected tempo |
| `scroll`, `scrollV` | Page progress and scroll velocity |
| `pointer` | `{x, y, down, vx, vy}` |
| `midi` | `{cc[], note[], clock, bpm}` |

`cueVJ.skin` is the surface engine bundled in the same file. It paints UI chrome such as panels and
buttons into an element's background as an SVG, leaving the real DOM to own layout, text, focus, and
interactivity.

## What works, and what doesn't

Honest caveats, because a framework that oversells itself wastes your time:

- **Works:** modern Chrome, Edge, Safari, Firefox. Mic, audio file, MIDI, scroll, and pointer input.
  Runs from `file://` with zero setup.
- **Requires a gesture:** audio and MIDI can only start on a user tap. That's a browser rule, not a bug.
- **MIDI** is Chromium only, since Web MIDI isn't in Safari or Firefox. It feature-detects and degrades.
- **Not a compositor.** No video layers, no recording, no blend-mode stack in this build.
- **CPU bound.** Pure SVG means no GPU acceleration, so very dense scenes can drop frames on old
  laptops. That's a deliberate trade for crisp, resolution-independent vectors.
- **Pre-1.0.** The API will still change.

## Collaborate

Making something with this, or want custom visuals for a set, a release, or a show? I'd like to
hear about it. [Get in touch](https://cuevj.com#contact), or email ronny@cuevj.com.

## License

[PolyForm Noncommercial 1.0.0](LICENSE). Read it, learn from it, build noncommercially with it.
Commercial use such as client work, paid performances, or products needs a separate license, so get
in touch.

Copyright (c) 2026 Ronny Singh. All rights reserved.
