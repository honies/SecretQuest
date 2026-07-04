
(function () {
  "use strict";

  const STORAGE_KEY = "proposal_game_state_v1";

  const defaultState = {
    currentScreen: "welcome",
    history: ["welcome"],
    historyIndex: 0,
    progress: 0,
    completedGames: { game1: false, game2: false, game3: false, game4: false },
    settings: { sound: true, theme: "light" },
    finalAnswered: false,
  };

  function cloneDefault() {
    return JSON.parse(JSON.stringify(defaultState));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return cloneDefault();
      const parsed = JSON.parse(raw);
      const merged = Object.assign(cloneDefault(), parsed);
      merged.completedGames = Object.assign(cloneDefault().completedGames, parsed.completedGames || {});
      merged.settings = Object.assign(cloneDefault().settings, parsed.settings || {});
      if (!Array.isArray(merged.history) || !merged.history.length) {
        merged.history = ["welcome"];
        merged.historyIndex = 0;
      }
      return merged;
    } catch (e) {
      return cloneDefault();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
    }
  }

  let state = loadState();

  const AudioEngine = (function () {
    let ctx = null;
    let musicTimer = null;
    let musicGain = null;
    let enabled = true;

    function getCtx() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ctx = new AC();
      }
      return ctx;
    }

    function resume() {
      const c = getCtx();
      if (c && c.state === "suspended") c.resume().catch(() => {});
    }

    function tone({ freq = 440, duration = 0.15, type = "sine", volume = 0.18, glideTo = null, delay = 0 }) {
      if (!enabled) return;
      const c = getCtx();
      if (!c) return;
      const t0 = c.currentTime + delay;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + duration);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(volume, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.03);
    }

    function pop() {
      tone({ freq: 500, duration: 0.12, type: "sine", volume: 0.16, glideTo: 900 });
    }
    function click() {
      tone({ freq: 320, duration: 0.06, type: "triangle", volume: 0.09 });
    }
    function chime() {
      [0, 0.1, 0.2].forEach((d, i) => tone({ freq: 640 + i * 160, duration: 0.4, type: "sine", volume: 0.13, delay: d }));
    }
    function success() {
      [0, 0.12, 0.24, 0.38].forEach((d, i) =>
        tone({ freq: 520 + i * 100, duration: 0.32, type: "sine", volume: 0.15, delay: d })
      );
    }
    function bigFanfare() {
      const notes = [523, 659, 784, 1046, 1318];
      notes.forEach((f, i) => tone({ freq: f, duration: 0.55, type: "sine", volume: 0.16, delay: i * 0.13 }));
      setTimeout(() => {
        [0, 0.1].forEach((d, i) => tone({ freq: 784 + i * 200, duration: 0.6, type: "triangle", volume: 0.1, delay: d }));
      }, 500);
    }
    function wrongMatch() {
      tone({ freq: 260, duration: 0.18, type: "sine", volume: 0.1, glideTo: 180 });
    }

    function startMusic() {
      const c = getCtx();
      if (!c || musicTimer) return;
      const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 987.77]; // мягкая пентатоника
      musicGain = c.createGain();
      musicGain.gain.value = enabled ? 0.05 : 0;
      musicGain.connect(c.destination);

      function playNote() {
        if (!enabled) return;
        const freq = scale[Math.floor(Math.random() * scale.length)];
        const t0 = c.currentTime;
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq / 2, t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.6, t0 + 1.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.2);
        osc.connect(g);
        g.connect(musicGain);
        osc.start(t0);
        osc.stop(t0 + 3.4);
      }
      playNote();
      musicTimer = setInterval(playNote, 2600);
    }
    function stopMusic() {
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    }
    function duckMusic(v) {
      if (musicGain) musicGain.gain.value = enabled ? v : 0;
    }
    function setEnabled(v) {
      enabled = v;
      if (musicGain) musicGain.gain.value = v ? 0.05 : 0;
    }

    return { resume, pop, click, chime, success, bigFanfare, wrongMatch, startMusic, stopMusic, duckMusic, setEnabled };
  })();

  function vibrate(pattern) {
    if (navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
      }
    }
  }

  const HEART_ICON_MARKUP =
    '<svg class="heart-icon" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor"/>' +
    "</svg>";

  function buildBackgroundParticles() {
    const layer = document.getElementById("particles-layer");
    const symbols = ["❤️", "🩷", "✨", "🌸", "💫", "🫧"];
    const total = window.innerWidth < 400 ? 16 : 24;
    for (let i = 0; i < total; i++) {
      const el = document.createElement("span");
      el.className = "particle";
      el.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      const size = 12 + Math.random() * 20;
      const left = Math.random() * 100;
      const duration = 10 + Math.random() * 12;
      const delay = -Math.random() * duration;
      const drift = 10 + Math.random() * 40;
      el.style.left = left + "vw";
      el.style.fontSize = size + "px";
      el.style.animationDuration = duration + "s";
      el.style.animationDelay = delay + "s";
      el.style.setProperty("--drift", drift + "px");
      layer.appendChild(el);
    }
  }

  const screens = {};
  document.querySelectorAll(".screen").forEach((el) => {
    screens[el.dataset.screen] = el;
  });

  const GAME_SEQUENCE = [
    { key: "game1", screen: "game1", percent: 25, emoji: "❤️", title: "Великолепно!", text: "Ты отлично справилась ❤️", next: "game2" },
    { key: "game2", screen: "game2", percent: 50, emoji: "🌸", title: "У тебя отлично получается!", text: "Идём дальше ✨", next: "game3" },
    { key: "game3", screen: "game3", percent: 75, emoji: "🐸", title: "Ква-фантастика!", text: "Лягушка очень довольна", next: "game4" },
    { key: "game4", screen: "game4", percent: 100, emoji: "😊", title: "Ты прошла всё!", text: "Дальше — самое важное...", next: "final" },
  ];

  let activeScreenEl = null;
  let currentCleanup = null;
  let pendingNextScreen = "welcome";
  let screenLockTimer = null;
  const SCREEN_ENTER_LOCK_MS = 560;

  function runCleanup() {
    if (currentCleanup) {
      try {
        currentCleanup();
      } catch (e) {
      }
      currentCleanup = null;
    }
  }

  const screenInitializers = {
    welcome: initWelcomeScreen,
    game1: initGame1,
    game2: initGame2,
    game3: initGame3,
    game4: initGame4,
    complete: null,
    final: initFinalScreen,
    celebration: initCelebrationScreen,
  };

  function displayScreen(name) {
    const el = screens[name];
    if (!el) return;
    runCleanup();
    if (activeScreenEl && activeScreenEl !== el) {
      activeScreenEl.classList.remove("is-active");
    }
    el.classList.add("is-active");
    activeScreenEl = el;
    state.currentScreen = name;
    updateTopBarFor(name);
    saveState();

    clearTimeout(screenLockTimer);
    el.classList.add("is-locked");
    screenLockTimer = setTimeout(() => {
      el.classList.remove("is-locked");
    }, SCREEN_ENTER_LOCK_MS);

    const init = screenInitializers[name];
    if (init) currentCleanup = init() || null;
  }

  function navigateTo(name) {
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(name);
    state.historyIndex = state.history.length - 1;
    displayScreen(name);
  }

  function goBack() {
    if (state.historyIndex > 0) {
      state.historyIndex--;
      displayScreen(state.history[state.historyIndex]);
    }
  }
  function goForward() {
    if (state.historyIndex < state.history.length - 1) {
      state.historyIndex++;
      displayScreen(state.history[state.historyIndex]);
    }
  }

  function completeCurrentGame(key) {
    const cfg = GAME_SEQUENCE.find((g) => g.key === key);
    if (!cfg) return;
    state.completedGames[key] = true;
    setProgress(cfg.percent);
    AudioEngine.success();
    vibrate([40, 30, 40]);
    document.getElementById("complete-emoji").textContent = cfg.emoji;
    document.getElementById("complete-title").textContent = cfg.title;
    document.getElementById("complete-text").textContent = cfg.text;
    pendingNextScreen = cfg.next;
    setTimeout(() => navigateTo("complete"), 550);
  }

  const topBar = document.getElementById("top-bar");
  const btnBack = document.getElementById("btn-back");
  const btnForward = document.getElementById("btn-forward");
  const btnSound = document.getElementById("btn-sound");
  const btnTheme = document.getElementById("btn-theme");
  const btnRestart = document.getElementById("btn-restart");
  const progressWrap = document.getElementById("progress-wrap");
  const progressFill = document.getElementById("progress-fill");
  const progressHeart = document.getElementById("progress-heart");
  const progressLabel = document.getElementById("progress-label");

  const NO_CHROME_SCREENS = ["welcome", "loading", "final", "celebration"];

  function updateTopBarFor(name) {
    const hideChrome = NO_CHROME_SCREENS.indexOf(name) !== -1;
    progressWrap.classList.toggle("is-visible", !hideChrome);
    btnBack.classList.toggle("is-hidden", hideChrome || state.historyIndex <= 0);
    btnForward.classList.toggle("is-hidden", hideChrome || state.historyIndex >= state.history.length - 1);
  }

  function setProgress(percent) {
    state.progress = percent;
    progressFill.style.width = percent + "%";
    progressHeart.style.left = percent + "%";
    progressLabel.textContent = Math.round(percent) + "%";
    saveState();
  }

  function applyTheme(theme) {
    if (theme === "dusk") {
      document.documentElement.setAttribute("data-theme", "dusk");
      document.getElementById("theme-icon").textContent = "☀️";
    } else {
      document.documentElement.removeAttribute("data-theme");
      document.getElementById("theme-icon").textContent = "🌙";
    }
  }

  function applySoundIcon() {
    document.getElementById("sound-icon").textContent = state.settings.sound ? "🔊" : "🔇";
  }

  function bindTopBar() {
    btnBack.addEventListener("click", () => {
      AudioEngine.click();
      goBack();
    });
    btnForward.addEventListener("click", () => {
      AudioEngine.click();
      goForward();
    });
    btnSound.addEventListener("click", () => {
      state.settings.sound = !state.settings.sound;
      AudioEngine.setEnabled(state.settings.sound);
      applySoundIcon();
      if (state.settings.sound) AudioEngine.click();
      saveState();
    });
    btnTheme.addEventListener("click", () => {
      state.settings.theme = state.settings.theme === "dusk" ? "light" : "dusk";
      applyTheme(state.settings.theme);
      AudioEngine.click();
      saveState();
    });
    btnRestart.addEventListener("click", openRestartModal);
  }

  /* ----- модалка подтверждения рестарта ----- */
  const modalOverlay = document.getElementById("modal-overlay");
  function openRestartModal() {
    AudioEngine.click();
    modalOverlay.classList.add("is-open");
  }
  function closeRestartModal() {
    modalOverlay.classList.remove("is-open");
  }
  function bindModal() {
    document.getElementById("modal-cancel").addEventListener("click", closeRestartModal);
    document.getElementById("modal-confirm").addEventListener("click", () => {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
      window.location.reload();
    });
  }

  /* ----- экран приветствия ----- */
  function initWelcomeScreen() {
    const btn = document.getElementById("btn-start");
    const handler = () => {
      AudioEngine.resume();
      AudioEngine.startMusic();
      AudioEngine.click();
      navigateTo("game1");
    };
    btn.addEventListener("click", handler);
    return () => btn.removeEventListener("click", handler);
  }

  function initGame1() {
    const stage = document.getElementById("g1-stage");
    const countEl = document.getElementById("g1-count");
    stage.innerHTML = "";
    const total = 8;
    document.getElementById("g1-total").textContent = total;
    countEl.textContent = "0";
    let caught = 0;
    let finished = false;
    const emojis = ["❤️", "🩷", "💗", "💖", "🧸", "🦋", "🌟", "🍭", "🌈", "🐰", "🐥", "🎀"];

    function spawnHeart() {
      if (finished) return;
      const stageW = stage.clientWidth;
      const stageH = stage.clientHeight;
      const el = document.createElement("div");
      el.className = "falling-heart";
      const glyph = document.createElement("span");
      glyph.className = "falling-heart-glyph";
      glyph.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      el.appendChild(glyph);

      const hitSize = 54; // фактический размер тап-зоны (см. .falling-heart в CSS)
      const startX = 8 + Math.random() * Math.max(10, stageW - hitSize - 16);
      const duration = 3.4 + Math.random() * 1.8;
      const rot = Math.random() * 50 - 25;
      const topSafety = 26;
      const bottomStart = 44;
      const travel = Math.max(50, stageH - hitSize - topSafety);
      el.style.left = startX + "px";
      el.style.bottom = -bottomStart + "px";
      el.style.setProperty("--fly-dist", -travel + "px");
      el.style.setProperty("--rot", rot + "deg");
      el.style.animationDuration = duration + "s";

      function catchHeart(e) {
        if (e) e.preventDefault();
        if (el.classList.contains("caught")) return;
        el.classList.add("caught");
        caught++;
        countEl.textContent = String(Math.min(caught, total));
        AudioEngine.pop();
        vibrate(20);
        const rect = el.getBoundingClientRect();
        const stageRect = stage.getBoundingClientRect();
        const pop = document.createElement("div");
        pop.className = "heart-pop";
        pop.textContent = "✨";
        pop.style.left = rect.left - stageRect.left + "px";
        pop.style.top = rect.top - stageRect.top + "px";
        stage.appendChild(pop);
        setTimeout(() => pop.remove(), 650);
        el.style.transition = "transform .3s ease, opacity .3s ease";
        el.style.transform = "scale(1.5)";
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 300);

        if (caught >= total && !finished) {
          finished = true;
          clearInterval(spawnTimer);
          setTimeout(() => completeCurrentGame("game1"), 500);
        }
      }
      el.addEventListener("pointerdown", catchHeart);
      el.addEventListener("touchstart", catchHeart, { passive: false });
      el.addEventListener("animationend", () => {
        if (!el.classList.contains("caught")) el.remove();
      });
      stage.appendChild(el);
    }

    const spawnTimer = setInterval(spawnHeart, 850);
    spawnHeart();

    return () => {
      clearInterval(spawnTimer);
      stage.innerHTML = "";
    };
  }

  function initGame2() {
    const grid = document.getElementById("g2-grid");
    grid.innerHTML = "";
    const symbols = ["❤️", "🌸", "⭐", "🐸"];
    let deck = symbols.concat(symbols);
    // перемешивание Фишера-Йейтса
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    let flipped = [];
    let matchedCount = 0;
    let lock = false;

    deck.forEach((symbol, idx) => {
      const card = document.createElement("div");
      card.className = "memory-card";
      card.dataset.symbol = symbol;
      card.dataset.idx = idx;
      card.innerHTML =
        '<div class="memory-card-inner">' +
        '<div class="memory-face front">' + HEART_ICON_MARKUP + "</div>" +
        '<div class="memory-face back">' + symbol + "</div>" +
        "</div>";
      card.addEventListener("pointerdown", () => onCardClick(card));
      grid.appendChild(card);
    });

    function onCardClick(card) {
      if (lock) return;
      if (card.classList.contains("is-flipped") || card.classList.contains("is-matched")) return;
      AudioEngine.click();
      card.classList.add("is-flipped");
      flipped.push(card);
      if (flipped.length === 2) {
        lock = true;
        const [a, b] = flipped;
        if (a.dataset.symbol === b.dataset.symbol) {
          setTimeout(() => {
            a.classList.add("is-matched");
            b.classList.add("is-matched");
            AudioEngine.chime();
            vibrate(25);
            matchedCount += 2;
            flipped = [];
            lock = false;
            if (matchedCount === deck.length) {
              setTimeout(() => flyAwayAllCards(), 400);
            }
          }, 350);
        } else {
          AudioEngine.wrongMatch();
          setTimeout(() => {
            a.classList.remove("is-flipped");
            b.classList.remove("is-flipped");
            flipped = [];
            lock = false;
          }, 700);
        }
      }
    }

    function flyAwayAllCards() {
      const cards = Array.from(grid.children);
      cards.forEach((card, i) => {
        const fx = (Math.random() - 0.5) * 260;
        const fy = -180 - Math.random() * 160;
        const fr = Math.random() * 360 - 180;
        card.style.setProperty("--fx", fx + "px");
        card.style.setProperty("--fy", fy + "px");
        card.style.setProperty("--fr", fr + "deg");
        card.style.animationDelay = i * 40 + "ms";
        card.classList.add("is-flying");
      });
      setTimeout(() => completeCurrentGame("game2"), 750);
    }

    return () => {
      grid.innerHTML = "";
    };
  }

  function buildFrogSvgDataUri() {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
        <rect width="300" height="300" fill="#EAF7F0"/>
        <ellipse cx="150" cy="185" rx="105" ry="90" fill="#8FD3A6"/>
        <ellipse cx="150" cy="200" rx="72" ry="55" fill="#BDE9C9"/>
        <circle cx="95" cy="100" r="38" fill="#8FD3A6"/>
        <circle cx="205" cy="100" r="38" fill="#8FD3A6"/>
        <circle cx="95" cy="98" r="21" fill="#FFFFFF"/>
        <circle cx="205" cy="98" r="21" fill="#FFFFFF"/>
        <circle cx="98" cy="98" r="10" fill="#4A4A4A"/>
        <circle cx="208" cy="98" r="10" fill="#4A4A4A"/>
        <circle cx="94" cy="94" r="3" fill="#FFFFFF"/>
        <circle cx="204" cy="94" r="3" fill="#FFFFFF"/>
        <path d="M105 205 Q150 240 195 205" stroke="#4A4A4A" stroke-width="6" fill="none" stroke-linecap="round"/>
        <circle cx="118" cy="185" r="10" fill="#F7B8CE" opacity="0.7"/>
        <circle cx="182" cy="185" r="10" fill="#F7B8CE" opacity="0.7"/>
        <ellipse cx="150" cy="215" rx="30" ry="14" fill="#FFFFFF" opacity="0.55"/>
      </svg>`;
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  function initGame3() {
    const grid = document.getElementById("g3-grid");
    grid.innerHTML = "";
    const frogUri = buildFrogSvgDataUri();
    const N = 3;
    const total = N * N;

    let permutation = Array.from({ length: total }, (_, i) => i);
    do {
      shuffleArray(permutation);
    } while (isSolved(permutation) || !isShuffleFairEnough(permutation));

    let selectedCell = null;
    let solved = false;
    const cellEls = [];

    for (let cell = 0; cell < total; cell++) {
      const piece = document.createElement("div");
      piece.className = "puzzle-piece";
      piece.dataset.cell = cell;
      grid.appendChild(piece);
      cellEls.push(piece);
      piece.addEventListener("pointerdown", () => onPieceClick(cell));
    }
    renderPieces();

    function renderPieces() {
      for (let cell = 0; cell < total; cell++) {
        const pieceValue = permutation[cell];
        const row = Math.floor(pieceValue / N);
        const col = pieceValue % N;
        const el = cellEls[cell];
        el.style.backgroundImage = "url('" + frogUri + "')";
        el.style.backgroundSize = "300% 300%";
        el.style.backgroundPosition = (col * 50) + "% " + (row * 50) + "%";
        el.classList.toggle("is-correct", pieceValue === cell);
      }
    }

    function onPieceClick(cell) {
      if (solved) return;
      AudioEngine.click();
      if (selectedCell === null) {
        selectedCell = cell;
        cellEls[cell].classList.add("is-selected");
        return;
      }
      if (selectedCell === cell) {
        cellEls[cell].classList.remove("is-selected");
        selectedCell = null;
        return;
      }
      // меняем местами два кусочка
      const tmp = permutation[selectedCell];
      permutation[selectedCell] = permutation[cell];
      permutation[cell] = tmp;
      cellEls[selectedCell].classList.remove("is-selected");
      selectedCell = null;
      renderPieces();

      if (isSolved(permutation)) {
        solved = true;
        vibrate([30, 20, 30, 20, 60]);
        AudioEngine.success();
        showSolvedFx();
        setTimeout(() => completeCurrentGame("game3"), 900);
      }
    }

    function showSolvedFx() {
      const fx = document.createElement("div");
      fx.className = "puzzle-solved-fx";
      fx.textContent = "🐸";
      grid.parentElement.appendChild(fx);
      grid.style.transition = "transform .5s ease";
      grid.style.transform = "scale(1.04)";
      for (let i = 0; i < 10; i++) {
        const h = document.createElement("div");
        h.className = "puzzle-burst-heart";
        h.innerHTML = HEART_ICON_MARKUP;
        h.style.position = "absolute";
        h.style.left = 50 + Math.random() * 20 - 10 + "%";
        h.style.top = "50%";
        h.style.fontSize = "18px";
        h.style.pointerEvents = "none";
        h.style.transition = "transform 1s ease, opacity 1s ease";
        grid.parentElement.appendChild(h);
        requestAnimationFrame(() => {
          const angle = Math.random() * Math.PI * 2;
          const dist = 60 + Math.random() * 60;
          h.style.transform = `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist - 40}px) scale(1.4)`;
          h.style.opacity = "0";
        });
        setTimeout(() => h.remove(), 1100);
      }
      setTimeout(() => fx.remove(), 1200);
    }

    return () => {
      grid.innerHTML = "";
    };
  }

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  function isSolved(perm) {
    return perm.every((v, i) => v === i);
  }
  function isShuffleFairEnough(perm) {
    let misplaced = perm.filter((v, i) => v !== i).length;
    return misplaced >= Math.floor(perm.length * 0.6);
  }

  function initGame4() {
    const tray = document.getElementById("g4-tray");
    const vase = document.getElementById("g4-vase");
    const vaseFlowers = document.getElementById("g4-vase-flowers");
    tray.innerHTML = "";
    vaseFlowers.innerHTML = "";
    vaseFlowers.classList.remove("bouquet-alive");

    const flowerTypes = ["🌸", "🌺", "🌷", "🌼", "🌻", "💐"];
    const totalFlowers = flowerTypes.length;
    let placed = 0;
    let finished = false;

    const activePointers = new Map();

    flowerTypes.forEach((emoji, i) => {
      const el = document.createElement("div");
      el.className = "flower-item";
      el.textContent = emoji;
      el.dataset.index = i;
      tray.appendChild(el);
      bindDrag(el);
    });

    function bindDrag(el) {
      let offsetX = 0,
        offsetY = 0,
        width = 0,
        height = 0;

      function onPointerDown(e) {
        if (el.classList.contains("placed")) return;
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        el.classList.add("dragging");
        el.style.left = rect.left + "px";
        el.style.top = rect.top + "px";
        el.style.width = width + "px";
        el.style.height = height + "px";
        AudioEngine.click();
        activePointers.set(e.pointerId, el);
        el.setPointerCapture && el.setPointerCapture(e.pointerId);
        document.addEventListener("pointermove", onPointerMove);
        document.addEventListener("pointerup", onPointerUp);
      }
      function onPointerMove(e) {
        if (!el.classList.contains("dragging")) return;
        el.style.left = e.clientX - offsetX + "px";
        el.style.top = e.clientY - offsetY + "px";
        const vaseRect = vase.getBoundingClientRect();
        const overVase = isPointInRectExpanded(e.clientX, e.clientY, vaseRect, 20);
        vase.classList.toggle("is-drop-hover", overVase);
      }
      function onPointerUp(e) {
        if (!el.classList.contains("dragging")) return;
        el.classList.remove("dragging");
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        const vaseRect = vase.getBoundingClientRect();
        const overVase = isPointInRectExpanded(e.clientX, e.clientY, vaseRect, 20);
        vase.classList.remove("is-drop-hover");
        if (overVase) {
          placeFlowerInVase(el);
        } else {
          // возвращаем на место в трее
          el.style.position = "";
          el.style.left = "";
          el.style.top = "";
          el.style.width = "";
          el.style.height = "";
        }
      }
      el.addEventListener("pointerdown", onPointerDown);
    }

    function isPointInRectExpanded(x, y, rect, pad) {
      return x >= rect.left - pad && x <= rect.right + pad && y >= rect.top - pad && y <= rect.bottom + pad;
    }

    function placeFlowerInVase(el) {
      if (el.classList.contains("placed")) return;
      el.classList.add("placed");
      el.style.position = "";
      el.style.left = "";
      el.style.top = "";
      AudioEngine.pop();
      vibrate(18);
      placed++;

      const span = document.createElement("span");
      span.textContent = el.textContent;
      const spread = 46;
      const x = (placed / totalFlowers) * spread * 2 - spread + Math.random() * 10 - 5;
      const y = -Math.random() * 30;
      span.style.left = "calc(50% + " + x + "px)";
      span.style.bottom = 10 + Math.abs(y) + "px";
      span.style.transform = "translateX(-50%)";
      vaseFlowers.appendChild(span);

      if (placed >= totalFlowers && !finished) {
        finished = true;
        vaseFlowers.classList.add("bouquet-alive");
        AudioEngine.success();
        vibrate([30, 20, 30, 20, 60]);
        setTimeout(() => completeCurrentGame("game4"), 900);
      }
    }

    return () => {
      tray.innerHTML = "";
      vaseFlowers.innerHTML = "";
    };
  }

  function initFinalScreen() {
    const screenEl = screens.final;
    const textWrap = document.getElementById("final-text");
    const heartEl = document.getElementById("final-heart");
    const questionEl = document.getElementById("final-question");
    const buttonsEl = document.getElementById("final-buttons");
    const btnYes = document.getElementById("btn-yes");
    const btnNo = document.getElementById("btn-no");

    textWrap.innerHTML = "";
    heartEl.classList.remove("is-shown");
    questionEl.classList.remove("is-shown");
    buttonsEl.classList.remove("is-shown");
    screenEl.classList.remove("dim-active");
    btnNo.className = "btn-no";
    btnNo.removeAttribute("style");

    const lines = [
      "Есть одна вещь...",
      "…которую я давно хотел тебе сказать...",
      "Мне очень хорошо рядом с тобой.",
      "Ты делаешь мои дни счастливее.",
      "И поэтому...",
    ];

    const timers = [];
    AudioEngine.duckMusic(0.02);

    timers.push(setTimeout(() => screenEl.classList.add("dim-active"), 100));

    lines.forEach((line, i) => {
      const span = document.createElement("span");
      span.className = "line";
      span.textContent = line;
      textWrap.appendChild(span);
      timers.push(
        setTimeout(() => {
          span.classList.add("is-shown");
          AudioEngine.chime();
        }, 700 + i * 1500)
      );
    });

    const afterLines = 700 + lines.length * 1500 + 500;
    timers.push(
      setTimeout(() => {
        heartEl.classList.add("is-shown");
        vibrate([30, 20, 30]);
      }, afterLines)
    );
    timers.push(
      setTimeout(() => {
        questionEl.classList.add("is-shown");
        AudioEngine.chime();
      }, afterLines + 900)
    );
    timers.push(
      setTimeout(() => {
        buttonsEl.classList.add("is-shown");
      }, afterLines + 1500)
    );

    /* ----- логика "убегающей" кнопки Подумать ещё ----- */
    let noClicks = 0;
    const maxNoClicks = 6;


    function getSafeInsets() {
      const cs = getComputedStyle(document.documentElement);
      const parse = (v) => parseFloat(cs.getPropertyValue(v)) || 0;
      return {
        top: parse("--safe-top"),
        bottom: parse("--safe-bottom"),
        left: parse("--safe-left"),
        right: parse("--safe-right"),
      };
    }

    function dodgeButton(e) {
      if (e) e.preventDefault();
      noClicks++;
      AudioEngine.click();
      vibrate(15);
      if (noClicks >= maxNoClicks) {
        btnNo.classList.add("is-gone");
        return;
      }
      if (!btnNo.classList.contains("is-fixed-pos")) {
        const rect = btnNo.getBoundingClientRect();
        btnNo.style.left = rect.left + "px";
        btnNo.style.top = rect.top + "px";
        btnNo.classList.add("is-fixed-pos");
      }
      const safe = getSafeInsets();
      const w = btnNo.offsetWidth || 150;
      const h = btnNo.offsetHeight || 54;
      const minLeft = 10 + safe.left;
      const minTop = 90 + safe.top;
      const maxLeft = Math.max(minLeft, window.innerWidth - w - 16 - safe.right);
      const maxTop = Math.max(minTop, window.innerHeight - h - 40 - safe.bottom);
      const newLeft = minLeft + Math.random() * (maxLeft - minLeft);
      const newTop = minTop + Math.random() * (maxTop - minTop);
      const scale = Math.max(0.42, 1 - noClicks * 0.11);
      const rotate = Math.random() * 50 - 25;
      btnNo.style.left = newLeft + "px";
      btnNo.style.top = newTop + "px";
      btnNo.style.transform = "scale(" + scale + ") rotate(" + rotate + "deg)";
    }

    function onYes() {
      AudioEngine.bigFanfare();
      AudioEngine.duckMusic(0.05);
      vibrate([40, 40, 40, 40, 120]);
      state.finalAnswered = true;
      saveState();
      navigateTo("celebration");
    }

    btnNo.addEventListener("pointerdown", dodgeButton);
    btnNo.addEventListener("mouseenter", dodgeButton);
    btnYes.addEventListener("click", onYes);

    return () => {
      timers.forEach((t) => clearTimeout(t));
      btnNo.removeEventListener("pointerdown", dodgeButton);
      btnNo.removeEventListener("mouseenter", dodgeButton);
      btnYes.removeEventListener("click", onYes);
    };
  }

  function initCelebrationScreen() {
    AudioEngine.duckMusic(0.05);
    const canvas = document.getElementById("celebration-canvas");
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    const colors = ["#F6B8D2", "#F2A9C6", "#E9C9EE", "#FFDCEB", "#FFF1E8", "#EAF7F0", "#FBEFD9"];
    const emojiPool = ["❤️", "✨", "🌸", "💖", "🌷", "💫"];
    let particles = [];

    function spawnBurst(n) {
      for (let i = 0; i < n; i++) {
        particles.push({
          x: Math.random() * window.innerWidth,
          y: -30 - Math.random() * 120,
          vx: (Math.random() - 0.5) * 1.6,
          vy: 1 + Math.random() * 2.4,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.16,
          size: 10 + Math.random() * 14,
          type: Math.random() < 0.55 ? "confetti" : "emoji",
          color: colors[Math.floor(Math.random() * colors.length)],
          emoji: emojiPool[Math.floor(Math.random() * emojiPool.length)],
          life: 0,
          maxLife: 480 + Math.random() * 380,
        });
      }
    }
    spawnBurst(130);
    const spawnTimer = setInterval(() => spawnBurst(10), 900);

    let raf = null;
    function frame() {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, 1 - p.life / p.maxLife);
        if (p.type === "confetti") {
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.font = p.size + 8 + "px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(p.emoji, 0, 0);
        }
        ctx.restore();
      });
      particles = particles.filter((p) => p.life < p.maxLife && p.y < window.innerHeight + 80);
      raf = requestAnimationFrame(frame);
    }
    frame();

    return () => {
      clearInterval(spawnTimer);
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }

  document.getElementById("btn-continue").addEventListener("click", () => {
    AudioEngine.click();
    navigateTo(pendingNextScreen);
  });

  function primeAudioOnce() {
    function handler() {
      AudioEngine.resume();
      document.removeEventListener("pointerdown", handler);
    }
    document.addEventListener("pointerdown", handler, { once: true });
  }

  function runLoadingSequence() {
    topBar.classList.add("tb-hidden");
    const fill = document.getElementById("loading-fill");
    let p = 0;
    const iv = setInterval(() => {
      p += 8 + Math.random() * 12;
      if (p >= 100) {
        p = 100;
        clearInterval(iv);
        setTimeout(finishLoading, 350);
      }
      fill.style.width = p + "%";
    }, 130);
  }

  function finishLoading() {
    screens.loading.classList.remove("is-active");
    topBar.classList.remove("tb-hidden");
    const startName = screens[state.currentScreen] ? state.currentScreen : "welcome";
    if (state.history.indexOf(startName) === -1) {
      state.history = [startName];
      state.historyIndex = 0;
    }
    setProgress(state.progress || 0);
    displayScreen(startName);
  }

  function setAppHeightVar() {
    document.documentElement.style.setProperty("--app-height", window.innerHeight + "px");
  }
  function preventIOSZoom() {
    ["gesturestart", "gesturechange", "gestureend"].forEach((evt) => {
      document.addEventListener(
        evt,
        (e) => {
          e.preventDefault();
        },
        { passive: false }
      );
    });

    let lastTouchEnd = 0;
    document.addEventListener(
      "touchend",
      (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
          e.preventDefault();
        }
        lastTouchEnd = now;
      },
      { passive: false }
    );

    document.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches && e.touches.length > 1) {
          e.preventDefault();
        }
      },
      { passive: false }
    );
  }

  function boot() {
    preventIOSZoom();
    setAppHeightVar();
    window.addEventListener("resize", setAppHeightVar);
    window.addEventListener("orientationchange", () => setTimeout(setAppHeightVar, 250));
    buildBackgroundParticles();
    applyTheme(state.settings.theme);
    applySoundIcon();
    AudioEngine.setEnabled(state.settings.sound);
    bindTopBar();
    bindModal();
    primeAudioOnce();
    runLoadingSequence();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
