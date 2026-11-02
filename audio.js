/* Jukebox al estilo de choppy-bitcoin: ABCJS, shuffle, repeat, volumen bajo.
   El navegador no suelta audio hasta el primer gesto: se intenta al cargar
   y, si falla, arranca en el primer toque. El buffer pasa por un GainNode. */
(function () {
  const ABCJS_SRC = "https://cdnjs.cloudflare.com/ajax/libs/abcjs/6.7.0/abcjs-basic-min.js";
  const SONGS = {
    bonny: {
      title: "Bonny at Morn",
      abc: `X:1
T:Bonny at Morn
C:Traditional Northumbrian
M:3/4
L:1/8
Q:1/4=76
K:Em
%%MIDI program 73
E2 | "Em"B3 c BA | B2 E2 FG | "D"A3 G FE | D2 E2 F2 | "Em"B3 c BA | B2 E2 FG | "D"A2 F2 D2 | "Em"E4 E2 |
"Em"B3 c BA | B2 E2 FG | "D"A3 G FE | D2 E2 F2 | "Em"ED EF GA | B2 e2 d2 | "Bm"B d3 F2 | "Em"E6 |]`
    },
    shady: {
      title: "Shady Grove",
      abc: `X:1
T:Shady Grove
C:Traditional
M:4/4
L:1/8
Q:1/4=112
K:Edor
%%MIDI program 71
"Em"E2 G2 A2 B2 A2 G2 | "D"E2 D2 E4 E2 D2 | "Em"E2 G2 A2 B2 A2 G2 | "D"A6 G2 |
"Em"E2 G2 A2 B2 A2 G2 | "D"E2 D2 E2 D2 | "Em"E2 G2 "D"F2 D2 "Em"E8 |]`
    },
    ode: {
      title: "Ode to Joy",
      abc: `X:1
T:Ode to Joy
C:Ludwig van Beethoven
M:4/4
L:1/4
Q:1/4=120
K:C
%%MIDI program 56
"C"G G G A | G A B2 | "G"A A B A | "C"G2 G2 | "C"G G G A | G A B2 | "G"A A B A | "C"G2 G2 |]`
    },
    fisher: {
      title: "Fisher's Hornpipe",
      abc: `X:1
T:Fisher's Hornpipe
C:James A. Fishar
M:C|
L:1/8
Q:1/2=84
K:D
%%MIDI program 71
|: dc | "D"dAFA GBAG | FAFA GBAG | "D"FDFD "A"GEGE | "D"FDFD "A"E2 dc |
"D"dAFA GBAG | FAFA GBAG | "D"FAdf "A"gecA | "D"d2 d2 d2 :|`
    }
  };

  let ctx = null;
  let musicGain = null;
  let sfxGain = null;
  let src = null;
  let vol = 0.18;
  let shuffle = true;
  let repeat = true;
  let order = [];
  let index = 0;
  let token = 0;
  let playing = false;
  let want = false;
  let booting = false;
  let currentId = null;
  let abcPromise = null;

  function paper() {
    let el = document.getElementById("juke-paper");
    if (!el) {
      el = document.createElement("div");
      el.id = "juke-paper";
      el.setAttribute("aria-hidden", "true");
      document.body.appendChild(el);
    }
    return el;
  }

  function ensureCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      musicGain = ctx.createGain();
      sfxGain = ctx.createGain();
      musicGain.gain.value = vol;
      sfxGain.gain.value = 0.45;
      musicGain.connect(ctx.destination);
      sfxGain.connect(ctx.destination);
    }
    return ctx;
  }

  function unlock() {
    const c = ensureCtx();
    if (c && c.state === "suspended") c.resume();
    return c;
  }

  function loadAbc() {
    if (window.ABCJS) return Promise.resolve(window.ABCJS);
    if (abcPromise) return abcPromise;
    abcPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = ABCJS_SRC;
      s.crossOrigin = "anonymous";
      s.onload = () => resolve(window.ABCJS);
      s.onerror = () => reject(new Error("abcjs"));
      document.head.appendChild(s);
    });
    return abcPromise;
  }

  function emit() {
    const song = currentId ? SONGS[currentId] : null;
    window.dispatchEvent(new CustomEvent("juke", {
      detail: {
        playing: playing && want,
        title: song ? song.title : "—",
        vol, shuffle, repeat
      }
    }));
  }

  function stopSource() {
    token++;
    if (!src) return;
    try { src.onended = null; } catch (e) {}
    try { src.stop(); } catch (e) {}
    try { src.disconnect(); } catch (e) {}
    src = null;
  }

  function buildOrder() {
    order = Object.keys(SONGS);
    if (shuffle) {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = order[i];
        order[i] = order[j];
        order[j] = tmp;
      }
    }
    index = 0;
  }

  function advance() {
    if (!want) return;
    if (!repeat) {
      playing = false;
      want = false;
      emit();
      return;
    }
    index++;
    if (index >= order.length) {
      if (shuffle) buildOrder();
      else index = 0;
    }
    playAt(index);
  }

  async function playAt(i) {
    const c = ensureCtx();
    if (!c) return false;
    if (c.state === "suspended") {
      try { await c.resume(); } catch (e) {}
    }
    if (c.state !== "running") return false;
    const id = order[i] || order[0];
    if (!id) return false;
    currentId = id;
    const gen = ++token;
    try {
      const ABCJS = await loadAbc();
      if (gen !== token || !want) return false;
      const visual = ABCJS.renderAbc(paper(), SONGS[id].abc, { add_classes: false, staffwidth: 480 })[0];
      if (!visual) throw new Error("sin partitura");
      const synth = new ABCJS.synth.CreateSynth();
      await synth.init({ visualObj: visual, audioContext: c });
      await synth.prime();
      if (gen !== token || !want) return false;
      const buf = (synth.getAudioBuffer && synth.getAudioBuffer()) || synth.audioBuffer || null;
      if (!buf) throw new Error("sin buffer");
      if (src) {
        try { src.onended = null; src.stop(); } catch (e) {}
      }
      const node = c.createBufferSource();
      node.buffer = buf;
      node.connect(musicGain);
      musicGain.gain.value = vol;
      node.onended = () => {
        if (gen !== token || !want) return;
        playing = false;
        advance();
      };
      src = node;
      node.start();
      playing = true;
      emit();
      return true;
    } catch (err) {
      console.warn("jukebox", err);
      if (gen === token && want) setTimeout(advance, 600);
      return false;
    }
  }

  function start() {
    unlock();
    if ((playing && want) || booting) return;
    if (!order.length) buildOrder();
    want = true;
    booting = true;
    playAt(index).finally(() => { booting = false; });
  }

  function stop() {
    want = false;
    playing = false;
    booting = false;
    stopSource();
    emit();
  }

  function setVol(v) {
    vol = Math.max(0, Math.min(1, Number(v)));
    if (musicGain) musicGain.gain.value = vol;
    emit();
  }

  function tone(freq, dur, type, gainV, slide) {
    const c = unlock();
    if (!c || c.state !== "running" || !sfxGain) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), c.currentTime + dur);
    g.gain.setValueAtTime(gainV, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g);
    g.connect(sfxGain);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  }

  const sfx = {
    ui() { tone(660, 0.05, "square", 0.07); },
    miss() { tone(520, 0.12, "sine", 0.1, 220); },
    hit() {
      tone(180, 0.18, "sawtooth", 0.16, 55);
      tone(90, 0.26, "triangle", 0.18, 40);
    },
    sunk() {
      tone(392, 0.1, "square", 0.1);
      setTimeout(() => tone(523, 0.1, "square", 0.1), 90);
      setTimeout(() => tone(659, 0.2, "square", 0.12), 180);
    },
    shield() { tone(880, 0.16, "triangle", 0.1, 1320); },
    alarm() {
      if (musicGain) {
        const now = musicGain.gain.value;
        musicGain.gain.value = Math.min(now, vol * 0.25);
        setTimeout(() => { if (musicGain && want) musicGain.gain.value = vol; }, 520);
      }
      tone(150, 0.16, "sawtooth", 0.14, 70);
      setTimeout(() => tone(110, 0.22, "sawtooth", 0.12, 50), 140);
    }
  };

  window.Juke = {
    SONGS, start, stop, unlock, setVol,
    volume: () => vol,
    setShuffle(v) { shuffle = !!v; if (shuffle) buildOrder(); emit(); },
    setRepeat(v) { repeat = !!v; emit(); },
    next() {
      if (!order.length) buildOrder();
      want = true;
      index++;
      if (index >= order.length) {
        if (shuffle) buildOrder();
        else index = 0;
      }
      playAt(index);
    },
    sfx,
    state: () => ({
      playing: playing && want,
      title: currentId ? SONGS[currentId].title : "—",
      vol, shuffle, repeat,
      ctx: ctx ? ctx.state : "off"
    })
  };

  const kick = () => start();
  document.addEventListener("pointerdown", kick, { capture: true });
  document.addEventListener("keydown", kick, { capture: true });
  window.addEventListener("load", () => setTimeout(start, 280));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && want) unlock();
  });
})();
