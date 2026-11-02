// audio.js - Jukebox adapted from choppy-bitcoin
(() => {
  let ctx = null;
  let jukeOn = false;
  let jukeVol = 0.8;
  let jukeGainNode = null;
  let jukeSrc = null;
  let jukeBuf = null;
  let abcSynth = null;
  let abcPaused = false;
  let abcWant = false;
  let abcId = "bonny";
  let jukeGen = 0;

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

  function tune(id, title, abc) {
    return { id, title, abc };
  }

  const SONGS = {
    bonny: tune("bonny", "Bonny at Morn", BONNY_ABC),
    shady: tune("shady", "Shady Grove", SHADY_ABC),
    ode: tune("ode", "Ode to Joy", ODE_ABC)
  };

  function jukeDest() {
    if (!ctx) return null;
    if (!jukeGainNode) {
      jukeGainNode = ctx.createGain();
      jukeGainNode.connect(ctx.destination);
    }
    jukeGainNode.gain.value = jukeVol;
    return jukeGainNode;
  }

  async function jukePlay(id) {
    unlock();
    await ensureAbc();
    if (!window.ABCJS) return;
    const song = SONGS[id] || SONGS.bonny;
    abcId = id;
    jukeOn = true;
    abcWant = true;
    const gen = ++jukeGen;
    try {
      const vis = window.ABCJS.renderAbc("ode-hold", song.abc);
      if (!vis || !vis[0]) return;
      const synth = new window.ABCJS.synth.CreateSynth();
      await synth.init({ visualObj: vis[0], audioContext: ctx });
      await synth.prime();
      if (gen !== jukeGen) return;
      abcSynth = synth;
      synth.start();
    } catch (e) {
      console.warn("Juke error", e);
      jukeOn = false;
    }
  }

  function jukeStop() {
    jukeOn = false;
    abcWant = false;
    jukeGen++;
    if (abcSynth && abcSynth.stop) try { abcSynth.stop(); } catch (e) {}
    if (jukeSrc) try { jukeSrc.stop(); } catch (e) {}
  }

  window.ArcadeAudio = {
    unlock,
    SONGS,
    jukePlay,
    jukeStop,
    jukePlaying: () => jukeOn,
    setJukeVolume: (v) => { jukeVol = Math.max(0, Math.min(1, v)); if (jukeGainNode) jukeGainNode.gain.value = jukeVol; },
    jukeVolume: () => jukeVol
  };

  // Silent hold for ABC render
  if (!document.getElementById("ode-hold")) {
    const el = document.createElement("div");
    el.id = "ode-hold";
    el.hidden = true;
    document.body.appendChild(el);
  }
})();
