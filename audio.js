// audio.js - Jukebox
(() => {
  let ctx = null;
  let jukeOn = false;
  let jukeVol = 0.2;
  let jukeGainNode = null;
  let abcSynth = null;
  let jukeGen = 0;
  let shuffle = true;
  let repeat = true;
  let playlist = [];
  let playlistIndex = 0;
  let started = false;

  function unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state !== "running") ctx.resume();
  }

  const ABCJS_SRC = "https://cdnjs.cloudflare.com/ajax/libs/abcjs/6.7.0/abcjs-basic-min.js";
  function ensureAbc() {
    if (window.ABCJS) return Promise.resolve(window.ABCJS);
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = ABCJS_SRC;
      s.onload = () => resolve(window.ABCJS);
      document.head.appendChild(s);
    });
  }

  const BONNY_ABC = `X:1\nT:Bonny at Morn\nM:3/4\nL:1/8\nQ:1/4=76\nK:Em\nE2 | "Em"B3 c BA | B2 E2 FG | "D"A3 G FE | D2 E2 F2 | "Em"B3 c BA | B2 E2 FG | "D"A2 F2 D2 | "Em"E4 E2 |]`;
  const SHADY_ABC = `X:1\nT:Shady Grove\nM:4/4\nL:1/8\nQ:1/4=112\nK:Edor\n"Em"E2 G2 A2 B2 A2 G2 | "D"E2 D2 E4 E2 D2 | "Em"E2 G2 A2 B2 A2 G2 | "D"E2 D2 E4 E4 |]`;
  const ODE_ABC = `X:1\nT:Ode to Joy\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\n"C"G G G A | G A B2 | "G"A A B A | "C"G2 G2 |]`;

  const SONGS = {
    bonny: { id: "bonny", title: "Bonny at Morn", abc: BONNY_ABC },
    shady: { id: "shady", title: "Shady Grove", abc: SHADY_ABC },
    ode: { id: "ode", title: "Ode to Joy", abc: ODE_ABC }
  };

  function buildPlaylist() {
    playlist = Object.keys(SONGS);
    if (shuffle) {
      for (let i = playlist.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
      }
    }
    playlistIndex = 0;
  }

  async function playNext() {
    if (!playlist.length) buildPlaylist();
    if (playlistIndex >= playlist.length) {
      if (repeat) {
        if (shuffle) buildPlaylist();
        else playlistIndex = 0;
      } else return;
    }
    const id = playlist[playlistIndex++];
    await jukePlay(id);
  }

  async function jukePlay(id) {
    unlock();
    await ensureAbc();
    if (!window.ABCJS) return;
    const song = SONGS[id] || SONGS.bonny;
    jukeOn = true;
    const gen = ++jukeGen;
    try {
      const vis = window.ABCJS.renderAbc("ode-hold", song.abc);
      if (!vis || !vis[0]) return;
      const synth = new window.ABCJS.synth.CreateSynth();
      await synth.init({ visualObj: vis[0], audioContext: ctx });
      await synth.prime();
      if (gen !== jukeGen) return;
      if (abcSynth && abcSynth.stop) try { abcSynth.stop(); } catch (e) {}
      abcSynth = synth;
      synth.start();
      setTimeout(() => {
        if (jukeOn && gen === jukeGen) playNext();
      }, 10000);
    } catch (e) {
      console.warn("Juke error", e);
    }
  }

  function jukeStop() {
    jukeOn = false;
    jukeGen++;
    if (abcSynth && abcSynth.stop) try { abcSynth.stop(); } catch (e) {}
  }

  function startJuke() {
    if (started) return;
    started = true;
    jukeVol = 0.2;
    buildPlaylist();
    playNext();
  }

  window.ArcadeAudio = {
    unlock,
    SONGS,
    jukePlay,
    jukeStop,
    startJuke,
    jukePlaying: () => jukeOn,
    setJukeVolume: (v) => { jukeVol = Math.max(0, Math.min(1, v)); if (jukeGainNode) jukeGainNode.gain.value = jukeVol; },
    jukeVolume: () => jukeVol
  };

  if (!document.getElementById("ode-hold")) {
    const el = document.createElement("div");
    el.id = "ode-hold";
    el.hidden = true;
    document.body.appendChild(el);
  }

  // Start on first interaction
  const start = () => { if (!started) startJuke(); };
  document.addEventListener("click", start, { once: true });
  document.addEventListener("touchstart", start, { once: true });
  document.addEventListener("keydown", start, { once: true });
})();
