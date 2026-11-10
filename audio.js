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
    },
    grace: {
      title: "Amazing Grace",
      abc: `X:1
T:Amazing Grace
C:Traditional
M:3/4
L:1/4
Q:1/4=72
K:G
%%MIDI program 73
D | "G"G G B | G2 B | "C"A G E | "G"G2 D | "G"G G B | G2 B | "D"A G E | "G"G2 |]`
    },
    green: {
      title: "Greensleeves",
      abc: `X:1
T:Greensleeves
C:Traditional
M:6/8
L:1/8
Q:3/8=66
K:Em
%%MIDI program 71
B | "Em"E2 F G2 A | "G"B2 c "D"B2 A | "Em"G2 F E2 D | "B7"E3 E2 B |
"Em"E2 F G2 A | "G"B2 c "D"B2 A | "Em"G2 F "B7"E2 D | "Em"E3 E2 :|`
    },
    scarborough: {
      title: "Scarborough Fair",
      abc: `X:1
T:Scarborough Fair
C:Traditional
M:3/4
L:1/4
Q:1/4=88
K:Am
%%MIDI program 75
"Am"A2 A | c2 B | "C"A2 G | "G"E3 | "Am"A2 A | c2 B | "G"A2 G | "Am"A3 |
"C"c2 d | e2 d | "G"c2 B | "Am"A3 | "C"c2 d | "G"e2 B | "Am"A2 G | A3 |]`
    },
    ash: {
      title: "The Ash Grove",
      abc: `X:1
T:The Ash Grove
C:Traditional Welsh
M:3/4
L:1/4
Q:1/4=96
K:G
%%MIDI program 73
"G"D G B | "D"A2 G | "G"B2 A | "D"G2 F | "G"D G B | "C"d2 c | "G"B A G | "D"A3 |
"G"D G B | "D"A2 G | "G"B2 d | "C"e2 d | "G"d B G | "D"A2 F | "G"G3 | G3 |]`
    },
    gifts: {
      title: "Simple Gifts",
      abc: `X:1
T:Simple Gifts
C:Joseph Brackett
M:4/4
L:1/4
Q:1/4=100
K:G
%%MIDI program 73
"G"D G G A | B G A2 | "D"A B A G | "G"G2 D2 | "G"D G G A | B G A2 | "D"A B A F | "G"G4 |
"D"A A B A | "G"G B A2 | "D"A B A G | "G"G2 D2 |]`
    },
    sailor: {
      title: "Drunken Sailor",
      abc: `X:1
T:Drunken Sailor
C:Traditional
M:4/4
L:1/8
Q:1/4=126
K:Edor
%%MIDI program 71
"Em"E2 E2 F2 G2 | A2 G2 F2 E2 | "D"D2 D2 E2 F2 | "Em"E4 E4 |
"Em"E2 E2 F2 G2 | A2 G2 F2 E2 | "D"D2 E2 F2 D2 | "Em"E4 E4 |]`
    },
    kesh: {
      title: "The Kesh Jig",
      abc: `X:1
T:The Kesh Jig
C:Traditional
M:6/8
L:1/8
Q:3/8=112
K:G
%%MIDI program 71
"G"G3 G A B | "D"A3 A B d | "G"e d d g d d | "C"e d B "D"d B A |
"G"G3 G A B | "D"A3 A B d | "C"e d d "G"g d B | "D"A G F "G"G3 :|`
    },
    morrison: {
      title: "Morrison's Jig",
      abc: `X:1
T:Morrison's Jig
C:Traditional
M:6/8
L:1/8
Q:3/8=116
K:Edor
%%MIDI program 71
"Em"E3 B3 | E3 B3 | "D"F3 A2 F | "Em"E3 B3 | "D"D F A d A F | "Em"E3 E3 :|`
    },
    star: {
      title: "Star of the County Down",
      abc: `X:1
T:Star of the County Down
C:Traditional
M:4/4
L:1/8
Q:1/4=96
K:Amix
%%MIDI program 73
"A"A2 A B c2 B A | "G"G2 E2 G2 A B | "A"c2 B A "G"B2 G2 | "A"A6 A B |
"A"c2 B A "G"B2 G2 | "A"A2 A B c2 B A | "G"G2 E2 "A"A2 G2 | A6 z2 |]`
    },
    thyme: {
      title: "Wild Mountain Thyme",
      abc: `X:1
T:Wild Mountain Thyme
C:Traditional
M:3/4
L:1/4
Q:1/4=88
K:G
%%MIDI program 73
"G"D G A | B2 A | "C"G E D | "G"B3 | "G"D G A | B2 d | "C"e d B | "D"A3 |
"G"B d e | "C"d2 B | "G"G A B | "D"A2 G | "G"D G A | B2 A | G3 | G3 |]`
    },
    redriver: {
      title: "Red River Valley",
      abc: `X:1
T:Red River Valley
C:Traditional
M:4/4
L:1/4
Q:1/4=92
K:G
%%MIDI program 73
"G"D | G G G A | B2 G B | "D"A2 A B | A2 F D | "G"G G G A | B2 G B | "D"A B A F | "G"G3 |]`
    },
    shen: {
      title: "Shenandoah",
      abc: `X:1
T:Shenandoah
C:Traditional
M:3/4
L:1/4
Q:1/4=76
K:D
%%MIDI program 73
"D"F2 F | A2 F | "G"G2 E | "D"F3 | "A"E2 F | G2 E | "D"D3 | D3 |
"D"F2 A | "G"B2 A | "D"F2 E | "A"E3 | "D"F2 A | "A"G2 E | "D"D3 | D3 |]`
    },
    saints: {
      title: "When the Saints",
      abc: `X:1
T:When the Saints Go Marching In
C:Traditional
M:4/4
L:1/4
Q:1/4=108
K:C
%%MIDI program 56
"C"C E F G | "C"G2 E2 | "C"C E F G | "C"G4 | "C"E G C'2 | "G"C'2 G2 | "C"E G D E | "C"C4 |]`
    },
    mountain: {
      title: "In the Hall of the Mountain King",
      abc: `X:1
T:In the Hall of the Mountain King
C:Edvard Grieg
M:4/4
L:1/8
Q:1/4=120
K:Bm
%%MIDI program 56
"Bm"B2 B2 c2 B2 | A2 A2 B2 A2 | G2 G2 A2 G2 | "F#"F2 F2 F4 |
"Bm"B2 B2 c2 B2 | A2 A2 B2 A2 | G2 G2 "F#"A2 F2 | "Bm"B2 B2 B4 |]`
    },
    rag: {
      title: "The Entertainer",
      abc: `X:1
T:The Entertainer
C:Scott Joplin
M:2/4
L:1/16
Q:1/4=80
K:C
%%MIDI program 1
"C"E2 G2 c2 e2 | g2 e2 c2 G2 | "G"A2 B2 A2 G2 | "C"e6 G2 |
E2 G2 c2 e2 | g2 e2 c2 G2 | "G"d2 e2 d2 B2 | "C"c6 z2 |]`
    },
    danny: {
      title: "Danny Boy",
      abc: `X:1
T:Danny Boy
C:Traditional
M:4/4
L:1/4
Q:1/4=72
K:D
%%MIDI program 73
"D"D F A d | "Bm"B A F2 | "Em"E G F E | "A"D3 z | "D"D F A d | "G"e d B2 | "A"A B A G | "D"F4 |]`
    },
    vidalita: {
      title: "Vidalita",
      abc: `X:1
T:Vidalita
C:Traditional Argentine
M:3/4
L:1/4
Q:1/4=84
K:Dm
%%MIDI program 73
"Dm"D F A | "A"A G E | "Dm"F E D | A3 | "F"A c d | "C"c A G | "Dm"A G F | D3 |
"Dm"D F A | "Gm"B A G | "A"A G E | "Dm"D3 |]`
    },
    condor: {
      title: "El Cóndor Pasa",
      abc: `X:1
T:El Condor Pasa
C:Traditional Andean
M:2/4
L:1/8
Q:1/4=96
K:Am
%%MIDI program 75
"Am"E2 A2 | A2 B2 | "G"G2 A2 | "Am"A4 | "Am"c2 B2 | A2 G2 | "E"E2 G2 | "Am"A4 |
"Am"e2 d2 | c2 B2 | "G"d2 c2 | "Am"B2 A2 | "E"G2 B2 | "Am"A2 E2 | A4 | A4 |]`
    },
    aura: {
      title: "Aura Lee",
      abc: `X:1
T:Aura Lee
C:Traditional
M:4/4
L:1/4
Q:1/4=96
K:G
%%MIDI program 73
"G"D | G B d B | "D"A2 G D | "G"G B d g | "D"f2 e d | "G"d B G B | "C"e2 d B | "G"d B "D"A F | "G"G3 |]`
    },
    camptown: {
      title: "Camptown Races",
      abc: `X:1
T:Camptown Races
C:Stephen Foster
M:2/4
L:1/8
Q:1/4=112
K:D
%%MIDI program 71
"D"A A A A | "A"B2 A2 | "D"A2 F2 | D4 | "D"A A A A | "G"d2 B2 | "A"A2 G2 | "D"F4 |
"A"E2 E2 | "D"F2 F2 | "A"E2 E2 | "D"F2 A2 | "G"B2 G2 | "D"A2 F2 | "A"E2 D2 | "D"D4 |]`
    },
    susanna: {
      title: "Oh Susanna",
      abc: `X:1
T:Oh Susanna
C:Stephen Foster
M:2/4
L:1/8
Q:1/4=108
K:G
%%MIDI program 71
"G"D2 G2 | G2 G2 | "D"A2 B2 | "G"G4 | "G"B2 B2 | "C"c2 B2 | "G"B2 A2 | G4 |
"D"A2 A2 | "G"B2 A2 | "D"A2 G2 | "G"B2 G2 | "D"A2 F2 | "G"G2 D2 | G4 | G4 |]`
    },
    parting: {
      title: "The Parting Glass",
      abc: `X:1
T:The Parting Glass
C:Traditional
M:3/4
L:1/4
Q:1/4=80
K:G
%%MIDI program 73
"G"D | G A B | "C"c2 B | "G"A G E | "D"D2 D | "G"G A B | "C"c2 e | "G"d B A | G2 |
"Em"B2 e | "C"d c B | "G"A G E | "D"D2 D | "G"G A B | "D"A G E | "G"G3 | G2 |]`
    },
    sibheag: {
      title: "Si Bheag Si Mhor",
      abc: `X:1
T:Si Bheag Si Mhor
C:Turlough O'Carolan
M:3/4
L:1/4
Q:1/4=72
K:D
%%MIDI program 46
"D"F2 G | A2 d | "G"B2 A | "D"F2 D | "Em"E2 F | G2 B | "A"A2 G | "D"F3 |
"D"A2 d | "G"B2 d | "D"A2 F | "Em"G2 E | "D"F2 A | "A"G2 E | "D"D3 | D3 |]`
    },
    lisdoon: {
      title: "Road to Lisdoonvarna",
      abc: `X:1
T:Road to Lisdoonvarna
C:Traditional
M:6/8
L:1/8
Q:3/8=120
K:Edor
%%MIDI program 71
"Em"E2 B E2 B | E2 B "D"A F D | "Em"E2 B E2 B | "D"A F D "Em"E3 |
"Em"E2 B E2 B | "G"G2 B "D"A F D | "Em"G2 B "D"A F D | "Em"E3 E3 :|`
    },
    banish: {
      title: "Banish Misfortune",
      abc: `X:1
T:Banish Misfortune
C:Traditional
M:6/8
L:1/8
Q:3/8=110
K:Dmix
%%MIDI program 71
"D"F2 A d2 e | f2 d "C"e2 d | "D"f2 d "Am"e2 d | "C"c2 A "G"G3 |
"D"F2 A d2 e | f2 d "C"e2 d | "Am"c2 A "G"B2 G | "D"A3 A3 :|`
    },
    swallow: {
      title: "Swallowtail Jig",
      abc: `X:1
T:Swallowtail Jig
C:Traditional
M:6/8
L:1/8
Q:3/8=116
K:Edor
%%MIDI program 71
"Em"G2 E G2 E | "D"F2 D F2 D | "Em"G2 E G2 E | "D"B2 A "Em"G3 |
"Em"G2 E G2 E | "D"F2 D d2 F | "Em"G2 E "D"F2 D | "Em"E3 E3 :|`
    },
    zamba: {
      title: "Zamba de Vargas",
      abc: `X:1
T:Zamba de Vargas
C:Traditional Argentine
M:3/4
L:1/4
Q:1/4=76
K:Am
%%MIDI program 73
"Am"E A c | "E"B2 A | "Am"c B A | "G"G2 E | "C"G c e | "G"d2 c | "Am"e d c | A3 |
"Am"A c e | "F"f2 e | "C"d c B | "E"B2 E | "Am"A c B | "E"B A G | "Am"A3 | A3 |]`
    },
    gato: {
      title: "El Gato",
      abc: `X:1
T:El Gato
C:Traditional Argentine
M:6/8
L:1/8
Q:3/8=108
K:A
%%MIDI program 71
"A"E2 A c2 A | "E"B2 G E3 | "A"A2 c e2 c | "E"B2 G E3 |
"A"A2 c e2 a | "D"f2 d "A"e2 c | "E"B2 G E2 G | "A"A3 A3 :|`
    },
    malambo: {
      title: "Malambo",
      abc: `X:1
T:Malambo
C:Traditional Argentine
M:6/8
L:1/8
Q:3/8=132
K:D
%%MIDI program 116
"D"D2 F A2 d | "A"e2 c A3 | "D"d2 A F2 D | "A"E3 E3 |
"D"D2 F A2 d | "G"B2 G "D"A2 F | "A"E2 G F2 E | "D"D3 D3 :|`
    },
    huella: {
      title: "Huella",
      abc: `X:1
T:Huella
C:Traditional Argentine
M:3/4
L:1/8
Q:1/4=80
K:Gm
%%MIDI program 73
"Gm"D2 G2 A2 | B4 A2 | "D"A2 G2 ^F2 | "Gm"G6 | "Gm"B2 d2 c2 | "Eb"B2 A2 G2 |
"D"A2 G2 ^F2 | "Gm"G6 |]`
    },
    carnavalito: {
      title: "Carnavalito",
      abc: `X:1
T:Carnavalito
C:Traditional Andean
M:2/4
L:1/8
Q:1/4=100
K:Am
%%MIDI program 75
"Am"A2 A2 | e2 d2 | "G"c2 B2 | "Am"A2 E2 | "Am"A2 B2 | c2 B2 | "E"G2 B2 | "Am"A4 |
"C"c2 c2 | "G"d2 c2 | "Am"e2 d2 | c2 A2 | "E"B2 G2 | "Am"A2 E2 | A4 | A4 |]`
    },
    chacarera: {
      title: "Chacarera",
      abc: `X:1
T:Chacarera
C:Traditional Argentine
M:6/8
L:1/8
Q:3/8=112
K:G
%%MIDI program 71
"G"G2 B d2 B | "D"c2 A F2 D | "G"G2 B d2 g | "D"f2 d "C"e3 |
"G"d2 B G2 B | "C"e2 c "G"d2 B | "D"A2 F D2 F | "G"G3 G3 :|`
    },
    bach: {
      title: "Minuet in G",
      abc: `X:1
T:Minuet in G
C:Johann Sebastian Bach
M:3/4
L:1/8
Q:1/4=112
K:G
%%MIDI program 6
"G"D4 G2 | G4 G2 | "D"A4 B2 | "G"G4 D2 | "C"E4 G2 | "G"D4 G2 | "D"A4 B2 | "G"G6 |
"G"d4 B2 | "D"c4 A2 | "G"B4 G2 | "D"A4 D2 | "G"D4 G2 | "D"A4 B2 | "G"G6 | G6 |]`
    },
    ode2: {
      title: "Ode to Joy (full)",
      abc: `X:1
T:Ode to Joy
C:Ludwig van Beethoven
M:4/4
L:1/4
Q:1/4=112
K:G
%%MIDI program 52
"G"B B C D | D C B A | "D"G G A B | "G"B2 A2 | "G"B B C D | D C B A | "D"G G A D | "G"G4 |
"D"A A B G | A B C B | "G"B A G A | "D"D2 E2 | "G"B B C D | D C B A | "D"G G A D | "G"G4 |]`
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
  let userStopped = false;
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

  function start(fromUser) {
    if (fromUser) userStopped = false;
    if (userStopped) return;
    unlock();
    if ((playing && want) || booting) return;
    if (!order.length) buildOrder();
    want = true;
    booting = true;
    playAt(index).finally(() => { booting = false; });
  }

  function stop() {
    userStopped = true;
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
    boom() {
      tone(70, 0.7, "sawtooth", 0.22, 26);
      tone(140, 0.35, "square", 0.1, 45);
      setTimeout(() => tone(48, 0.5, "triangle", 0.2, 24), 60);
    },
    shield() { tone(880, 0.16, "triangle", 0.1, 1320); },
    streak(n) {
      // arpegio que sube con la racha
      const base = [523, 587, 659, 784, 880, 1047];
      const k = Math.min(base.length, Math.max(2, n));
      for (let i = 0; i < k; i++) setTimeout(() => tone(base[i], 0.09, "triangle", 0.08), 260 + i * 55);
    },
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
      userStopped = false;
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

  const kick = (ev) => {
    const t = ev && ev.target && ev.target.closest && ev.target.closest("#juke-stop, #juke-close, #juke-fab");
    if (t) return;
    if (!userStopped) start(false);
  };
  document.addEventListener("pointerdown", kick, { capture: true });
  document.addEventListener("keydown", kick, { capture: true });
  window.addEventListener("load", () => setTimeout(() => start(false), 280));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && want) unlock();
  });
})();
