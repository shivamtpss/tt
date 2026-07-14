/**
 * ShivamGuide — drop-in Live2D onboarding tour for any website.
 *
 * Peer runtimes (Cubism + Pixi + cubism4) load automatically on create()
 * if they are not already on the page. You can still load them yourself.
 *
 * Also load styles once:
 *   import "shivam-guide/shivam-guide.css";
 *
 * Usage:
 *   const tour = await ShivamGuide.create({
 *     modelUrl: 'https://…/model.json',
 *     speaker: 'Guide',
 *     steps: [
 *       { line: 'Welcome!', pose: 0, expression: 1 },
 *       { target: '#cta', line: 'Tap this button.', pose: 2, nextLabel: 'Got it' },
 *     ],
 *     autoStart: true,
 *   });
 */
(function (global) {
  "use strict";

  const PEERS = [
    {
      id: "cubism-core",
      src: "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js",
      ready: () => !!(global.Live2DCubismCore || global.Live2DCubismFramework),
    },
    {
      id: "pixi",
      src: "https://cdn.jsdelivr.net/npm/pixi.js@6.5.10/dist/browser/pixi.min.js",
      ready: () => !!global.PIXI,
    },
    {
      id: "cubism4",
      src: "https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/cubism4.min.js",
      ready: () => !!(global.PIXI && global.PIXI.live2d),
    },
  ];

  function loadScript(src, id) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-sg-peer="${id}"]`);
      if (existing) {
        if (existing.dataset.loaded === "1") resolve();
        else existing.addEventListener("load", () => resolve(), { once: true });
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = false;
      s.dataset.sgPeer = id;
      s.onload = () => {
        s.dataset.loaded = "1";
        resolve();
      };
      s.onerror = () => reject(new Error("ShivamGuide: failed to load " + src));
      document.head.appendChild(s);
    });
  }

  /** Inject Cubism + Pixi + cubism4 from CDN when missing (browser only). */
  async function ensurePeers() {
    if (typeof document === "undefined") {
      throw new Error("ShivamGuide: peers need a browser document");
    }
    for (const peer of PEERS) {
      if (peer.ready()) continue;
      await loadScript(peer.src, peer.id);
      if (!peer.ready()) {
        // give the runtime a tick after script onload
        await new Promise((r) => setTimeout(r, 0));
      }
      if (!peer.ready()) {
        throw new Error(
          "ShivamGuide: peer not available after load (" + peer.id + ")"
        );
      }
    }
  }

  const DEFAULT_POSES = [
    { id: 0, name: "Hello wave" },
    { id: 1, name: "Explain" },
    { id: 2, name: "Point out" },
    { id: 3, name: "Nod along" },
    { id: 4, name: "Surprise" },
    { id: 5, name: "Think it over" },
    { id: 6, name: "Excited" },
    { id: 7, name: "Cheer" },
    { id: 8, name: "Goodbye" },
  ];

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function merge(a, b) {
    return Object.assign({}, a, b);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(
      /[&<>"']/g,
      (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  /** Apply theme colors + tunables to the root element as CSS variables. */
  function applyTheme(root, opts) {
    const t = opts.theme || {};
    const varMap = {
      accent: "--sg-accent",
      ring: "--sg-ring",
      dim: "--sg-dim",
      speaker: "--sg-speaker",
      speakerColor: "--sg-speaker",
      font: "--sg-font",
      dialogueBg: "--sg-dialogue-bg",
      textColor: "--sg-text",
      primary: "--sg-primary",
      primaryText: "--sg-primary-text",
      radius: "--sg-radius",
    };
    for (const key in varMap) {
      if (t[key] != null) root.style.setProperty(varMap[key], String(t[key]));
    }
    if (opts.spotlightRadius != null) {
      root.style.setProperty("--sg-radius", `${opts.spotlightRadius}px`);
    }
  }

  function createRoot(opts) {
    const root = document.createElement("div");
    root.className = "sg-root";
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      root.classList.add("sg-mobile");
    }
    root.hidden = true;
    root.setAttribute("aria-live", "polite");
    const progress = opts.showProgress
      ? '<div class="sg-progress"><div class="sg-progress-bar" data-sg="progress"></div></div>'
      : "";
    root.innerHTML = `
      <div class="sg-spotlight" data-sg="spotlight"></div>
      <div class="sg-hitblock" data-sg="hitblock" aria-hidden="true"></div>
      <div class="sg-stage" data-sg="stage">
        <div class="sg-guide">
          <div class="sg-canvas" data-sg="canvas">
            <div class="sg-status" data-sg="status">Loading…</div>
          </div>
        </div>
        <div class="sg-dialogue">
          <div class="sg-meta">
            <div class="sg-speaker-block">
              <span class="sg-speaker" data-sg="speaker">${escapeHtml(opts.speaker)}</span>
              <span class="sg-tag" data-sg="tag">pose</span>
            </div>
            <span class="sg-pill" data-sg="pill">1 / 1</span>
          </div>
          ${progress}
          <p class="sg-text" data-sg="text"></p>
          <div class="sg-actions">
            <span class="sg-hint" data-sg="hint" hidden>${escapeHtml(opts.clickHint || "Tap the highlighted area")}</span>
            ${opts.showPoseReplay ? `<button type="button" class="sg-btn sg-btn-ghost" data-sg="pose">${escapeHtml(opts.poseReplayLabel || "Replay pose")}</button>` : ""}
            ${opts.showSkip ? `<button type="button" class="sg-btn sg-btn-ghost" data-sg="skip">${escapeHtml(opts.skipLabel || "Skip")}</button>` : ""}
            <button type="button" class="sg-btn sg-btn-primary" data-sg="next">Next</button>
          </div>
        </div>
      </div>
    `;
    applyTheme(root, opts);
    (opts.mount || document.body).appendChild(root);
    return root;
  }

  async function create(userOptions) {
    const opts = merge(
      {
        modelUrl: "",
        speaker: "Guide",
        steps: [],
        poses: DEFAULT_POSES,
        autoStart: true,
        showPoseReplay: true,
        showSkip: true,
        showProgress: false,
        lipSync: true,
        loadPeers: true,
        mount: null,
        storageKey: null,
        zIndex: 9999,
        // --- Customization ---
        theme: null,
        typeSpeedMs: 18,
        spotlightPadding: 12,
        spotlightRadius: null,
        keyboard: true,
        advanceOnClick: false,
        clickHint: "Tap the highlighted area",
        reduceMotion: "auto",
        mobileScale: 1,
        desktopScale: 1,
        skipLabel: "Skip",
        doneLabel: "Done",
        nextLabel: null,
        poseReplayLabel: "Replay pose",
        // --- Callbacks ---
        onStart: null,
        onStep: null,
        onBeforeStep: null,
        onComplete: null,
        onSkip: null,
        onEnd: null,
      },
      userOptions || {}
    );

    if (!opts.modelUrl) throw new Error("ShivamGuide: modelUrl is required");
    if (!opts.steps?.length) throw new Error("ShivamGuide: steps[] is required");

    const prefersReduced =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;
    const reduceMotion =
      opts.reduceMotion === true ||
      (opts.reduceMotion === "auto" && prefersReduced);
    if (opts.loadPeers !== false) {
      await ensurePeers();
    }

    if (!global.PIXI?.live2d) {
      throw new Error(
        "ShivamGuide: Cubism/Pixi peers missing (auto-load failed or loadPeers:false)"
      );
    }

    if (opts.storageKey && global.localStorage?.getItem(opts.storageKey) === "1") {
      return {
        skippedByStorage: true,
        start() {},
        next() {},
        prev() {},
        goTo() {},
        replayPose() {},
        end() {},
        destroy() {},
        getIndex: () => -1,
        isActive: () => false,
      };
    }

    const root = createRoot(opts);
    root.style.zIndex = String(opts.zIndex);
    const $ = (k) => root.querySelector(`[data-sg="${k}"]`);
    const stage = $("stage");
    const spotlight = $("spotlight");
    const canvasWrap = $("canvas");
    const statusEl = $("status");
    const textEl = $("text");
    const pillEl = $("pill");
    const tagEl = $("tag");
    const speakerEl = $("speaker");
    const btnNext = $("next");
    const btnSkip = $("skip");
    const btnPose = $("pose");
    const progressEl = $("progress");
    const hintEl = $("hint");

    speakerEl.textContent = opts.speaker;

    let stepIndex = 0;
    let typeTimer = null;
    let lastTarget = null;
    let model = null;
    let app = null;
    let typingDone = true;
    let hopTimer = null;
    let gimmickTimers = [];
    let lipTalking = false;
    let paramOverrides = Object.create(null);
    let overrideKeys = [];
    let active = false;
    let destroyed = false;

    function core() {
      return model?.internalModel?.coreModel;
    }

    function setParam(id, value) {
      const c = core();
      if (!c) return;
      try {
        if (typeof c.setParameterValueById === "function") c.setParameterValueById(id, value);
        else if (typeof c.SetParameterValueById === "function") c.SetParameterValueById(id, value);
      } catch (_) {}
    }

    function holdParam(id, value) {
      if (!(id in paramOverrides)) overrideKeys.push(id);
      paramOverrides[id] = value;
      setParam(id, value);
    }

    function releaseParams(...ids) {
      if (!ids.length) {
        paramOverrides = Object.create(null);
        overrideKeys = [];
        return;
      }
      ids.forEach((id) => delete paramOverrides[id]);
      overrideKeys = Object.keys(paramOverrides);
    }

    function clearGimmicks() {
      gimmickTimers.forEach(clearTimeout);
      gimmickTimers = [];
      lipTalking = false;
      releaseParams();
      setParam("ParamMouthOpenY", 0);
    }

    function later(ms, fn) {
      const id = setTimeout(fn, ms);
      gimmickTimers.push(id);
      return id;
    }

    function fitModel() {
      if (!model || !app) return;
      const w = Math.max(app.screen.width, 1);
      const h = Math.max(app.screen.height, 1);
      const mobile = window.innerWidth < 640;
      model.anchor.set(0.5, 0.5);
      // Always reset so repeated fits don't compound
      model.scale.set(1);

      if (mobile) {
        // Bust frame: oversize the model so legs crop at the BOTTOM.
        // Keep full head in frame (nudge y down if hair clips).
        const naturalH = Math.max(model.height, 1);
        const naturalW = Math.max(model.width, 1);
        const scale =
          Math.max((h * 2.45) / naturalH, (w * 1.2) / naturalW) *
          (opts.mobileScale || 1);
        model.scale.set(scale);
        model.x = w * 0.5;
        const drawnH = model.height;
        // Slightly below half-center → face/hair fully inside, waist+ crop out
        model.y = drawnH < h ? h * 0.55 : drawnH * 0.44;
      } else {
        const scale =
          Math.min(w / model.width, h / model.height) * 1.15 * (opts.desktopScale || 1);
        model.scale.set(scale);
        model.x = w * 0.5;
        model.y = h * 0.62;
      }
    }

    let hopCooldownUntil = 0;
    let resizeTimer = null;
    let placeTimer = null;
    let lastCanvasW = 0;
    let lastCanvasH = 0;
    let mobileDocked = false;

    /** Resize Pixi to the real CSS box, then re-fit the bust (esp. after un-hiding). */
    function syncCanvasSize(force = false) {
      if (!app || destroyed) return false;
      const cw = canvasWrap.clientWidth;
      const ch = canvasWrap.clientHeight;
      if (cw < 8 || ch < 8) return false;
      if (!force && cw === lastCanvasW && ch === lastCanvasH) return false;
      lastCanvasW = cw;
      lastCanvasH = ch;
      app.renderer.resize(cw, ch);
      fitModel();
      return true;
    }

    function afterLayout(fn) {
      requestAnimationFrame(() => requestAnimationFrame(fn));
    }

    function isMobile() {
      return window.innerWidth < 640;
    }

    /** Keep spotlight targets above the bottom sheet on phones */
    function sheetReservePx() {
      if (!isMobile()) return 24;
      const stageH = stage.offsetHeight || Math.min(window.innerHeight * 0.36, 200);
      return stageH + 20;
    }

    function scrollTargetIntoSafeView(el) {
      const reserve = sheetReservePx();
      const padTop = 16;
      const r = el.getBoundingClientRect();
      const safeBottom = window.innerHeight - reserve;
      const ring = 16;
      const fullyVisible =
        r.top - ring >= padTop && r.bottom + ring <= safeBottom;
      if (fullyVisible) return;

      const safeH = Math.max(100, safeBottom - padTop);
      const desiredTop = padTop + Math.min(r.height * 0.1, safeH * 0.2);
      const delta = r.top - desiredTop;
      // Ignore tiny drift — prevents address-bar scroll/resize thrash
      if (Math.abs(delta) < 12) return;
      const scroller = document.scrollingElement || document.documentElement;
      scroller.scrollBy({ top: delta, behavior: "smooth" });
    }

    function dockMobileSheet({ hop = false } = {}) {
      root.classList.add("sg-mobile");
      stage.classList.remove("sg-facing-left", "sg-stack");
      stage.style.left = "0px";
      stage.style.right = "0px";
      stage.style.bottom = "0px";
      stage.style.top = "auto";
      mobileDocked = true;
      if (hop) hopGuide(true);
    }

    function updateSpotlightRect(el) {
      const pad = opts.spotlightPadding ?? 12;
      const r = el.getBoundingClientRect();
      spotlight.style.top = `${Math.max(8, r.top - pad)}px`;
      spotlight.style.left = `${Math.max(8, r.left - pad)}px`;
      spotlight.style.width = `${r.width + pad * 2}px`;
      spotlight.style.height = `${r.height + pad * 2}px`;
      spotlight.style.opacity = "1";
      spotlight.classList.add("sg-visible");
      el.classList.add("sg-target");
      lastTarget = el;
    }

    async function initModel() {
      const { Live2DModel } = PIXI.live2d;
      // Root starts hidden → clientWidth is 0. Seed with CSS-intended size.
      const mobile = isMobile();
      const seedW = mobile ? 100 : canvasWrap.clientWidth || 180;
      const seedH = mobile ? 148 : canvasWrap.clientHeight || 260;
      app = new PIXI.Application({
        width: seedW,
        height: seedH,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(global.devicePixelRatio || 1, 2),
      });
      canvasWrap.appendChild(app.view);
      statusEl.textContent = "Loading model…";

      model = await Live2DModel.from(opts.modelUrl, { autoInteract: false });
      statusEl.textContent = "";
      fitModel();
      app.stage.addChild(model);

      app.ticker.add(() => {
        if (!model || overrideKeys.length === 0) return;
        for (let k = 0; k < overrideKeys.length; k++) {
          const id = overrideKeys[k];
          setParam(id, paramOverrides[id]);
        }
      });

      document.addEventListener("pointermove", onPointerMove);
      window.addEventListener("resize", onResize);
    }

    function onPointerMove(e) {
      if (model && active) model.focus(e.clientX, e.clientY);
    }

    function onResize() {
      // Mobile address-bar / keyboard fires resize often — debounce and
      // never re-hop / re-dock the guide (that looked like it was reloading).
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!app || destroyed) return;
        syncCanvasSize();
        if (!active) return;
        const step = opts.steps[stepIndex];
        if (step?.target && lastTarget) {
          updateSpotlightRect(lastTarget);
          lookAtTarget(lastTarget);
        }
      }, 180);
    }

    function playPose(index, force = true) {
      if (!model) return;
      try {
        const defs = model.internalModel?.motionManager?.definitions?.[""];
        if (!defs?.length) {
          model.motion("");
          return;
        }
        const i = ((index % defs.length) + defs.length) % defs.length;
        model.motion("", i, force ? 3 : 2);
      } catch (_) {}
    }

    function setExpression(i) {
      if (!model || typeof i !== "number") return;
      try {
        const mgr = model.internalModel?.motionManager?.expressionManager;
        const count = mgr?.definitions?.length ?? 11;
        model.expression(((i % count) + count) % count);
      } catch (_) {
        try {
          model.expression(i);
        } catch (__) {}
      }
    }

    function poseLabel(step) {
      if (step.poseName) return `POSE · ${step.poseName}`;
      const id = step.pose ?? 0;
      const p = (opts.poses || []).find((x) => x.id === id) || (opts.poses || [])[id];
      return p ? `POSE · ${p.name}` : `POSE · #${id}`;
    }

    function showTag(label) {
      tagEl.textContent = label || "pose";
      tagEl.style.animation = "none";
      void tagEl.offsetWidth;
      tagEl.style.animation = "";
    }

    function runFace(name) {
      clearGimmicks();
      if (!model || !name) return;
      switch (name) {
        case "smile":
          holdParam("ParamCheek", 0.4);
          holdParam("ParamMouthForm", 0.5);
          holdParam("ParamEyeLSmile", 0.4);
          holdParam("ParamEyeRSmile", 0.4);
          break;
        case "look":
          holdParam("ParamEyeBallY", 0.25);
          later(100, () => holdParam("ParamEyeBallX", 0.5));
          later(700, () => holdParam("ParamEyeBallX", -0.35));
          later(1300, () => {
            holdParam("ParamEyeBallX", 0.1);
            holdParam("ParamEyeBallY", 0.1);
          });
          break;
        case "sparkle":
          holdParam("ParamEyeLOpen", 1.1);
          holdParam("ParamEyeROpen", 1.1);
          holdParam("ParamCheek", 0.7);
          break;
        case "wink":
          later(400, () => {
            holdParam("ParamEyeLOpen", 0);
            holdParam("ParamEyeLSmile", 1);
          });
          later(1000, () => {
            holdParam("ParamEyeLOpen", 1);
            holdParam("ParamEyeLSmile", 0.2);
          });
          break;
        case "think":
          holdParam("ParamBrowLAngle", 0.5);
          holdParam("ParamEyeBallX", -0.45);
          holdParam("ParamEyeBallY", 0.3);
          later(1600, () => {
            holdParam("ParamBrowLAngle", 0);
            holdParam("ParamEyeBallX", 0);
            holdParam("ParamEyeBallY", 0);
          });
          break;
        case "hype":
          holdParam("ParamCheek", 0.85);
          holdParam("ParamEyeLOpen", 1.1);
          holdParam("ParamEyeROpen", 1.1);
          break;
        case "bye":
          later(350, () => {
            holdParam("ParamEyeROpen", 0);
            holdParam("ParamEyeRSmile", 1);
            holdParam("ParamCheek", 0.5);
          });
          later(1100, () => {
            holdParam("ParamEyeROpen", 1);
            holdParam("ParamEyeRSmile", 0.2);
          });
          break;
        default:
          break;
      }
    }

    function applyPerformance(step) {
      const poseId = typeof step.pose === "number" ? step.pose : 0;
      showTag(poseLabel(step));
      setExpression(step.expression);
      playPose(poseId, true);
      later(90, () => playPose(poseId, true));
      later(140, () => runFace(step.face));
    }

    function typeLine(text) {
      clearInterval(typeTimer);
      typingDone = false;
      lipTalking = !!opts.lipSync;

      // Reduced motion (or speed 0): show the whole line instantly, no lip flap
      if (reduceMotion || opts.typeSpeedMs <= 0) {
        textEl.textContent = text;
        typingDone = true;
        lipTalking = false;
        return;
      }

      // Reuse a single text node + caret element (no per-tick DOM teardown)
      textEl.textContent = "";
      const textNode = document.createTextNode("");
      const caret = document.createElement("span");
      caret.className = "sg-caret";
      textEl.appendChild(textNode);
      textEl.appendChild(caret);

      let i = 0;
      typeTimer = setInterval(() => {
        textNode.nodeValue = text.slice(0, i);
        if (lipTalking && i < text.length) {
          const ch = text[i] || " ";
          const open = /[aeiouAEIOU]/.test(ch) ? 0.7 : /[\s.,!?]/.test(ch) ? 0.05 : 0.35;
          holdParam("ParamMouthOpenY", open);
        }
        i += 1;
        if (i > text.length) {
          clearInterval(typeTimer);
          typingDone = true;
          lipTalking = false;
          holdParam("ParamMouthOpenY", 0);
          later(200, () => releaseParams("ParamMouthOpenY"));
          textNode.nodeValue = text;
          if (caret.parentNode) caret.parentNode.removeChild(caret);
        }
      }, Math.max(4, opts.typeSpeedMs || 18));
    }

    function skipTyping(fullText) {
      if (typingDone) return false;
      clearInterval(typeTimer);
      textEl.textContent = fullText;
      typingDone = true;
      lipTalking = false;
      holdParam("ParamMouthOpenY", 0);
      later(200, () => releaseParams("ParamMouthOpenY"));
      return true;
    }

    function hopGuide(force = false) {
      const now = Date.now();
      if (!force && now < hopCooldownUntil) return;
      hopCooldownUntil = now + 650;
      stage.classList.remove("sg-pop");
      void stage.offsetWidth;
      stage.classList.add("sg-pop");
      clearTimeout(hopTimer);
      hopTimer = setTimeout(() => stage.classList.remove("sg-pop"), 500);
    }

    function lookAtTarget(el) {
      if (!model || !el) return;
      const r = el.getBoundingClientRect();
      model.focus(r.left + r.width / 2, r.top + r.height / 2);
    }

    function placeGuideDefault() {
      if (isMobile()) {
        dockMobileSheet({ hop: true });
        afterLayout(() => syncCanvasSize());
        return;
      }
      mobileDocked = false;
      root.classList.remove("sg-mobile");
      stage.classList.remove("sg-facing-left", "sg-stack");
      const margin = 12;
      const w = stage.offsetWidth || 480;
      const h = stage.offsetHeight || 220;
      const left = clamp((window.innerWidth - w) / 2, margin, window.innerWidth - w - margin);
      const top = clamp(window.innerHeight - h - 24, margin, window.innerHeight - h - margin);
      stage.style.left = `${left}px`;
      stage.style.top = `${top}px`;
      stage.style.bottom = "";
      stage.style.right = "";
      hopGuide(true);
      afterLayout(() => syncCanvasSize());
    }

    function placeGuideNear(el, { hop = false } = {}) {
      const margin = 10;
      const gap = 14;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Phones: dock sheet at bottom; keep spotlight clear above it
      if (isMobile()) {
        dockMobileSheet({ hop });
        scrollTargetIntoSafeView(el);
        lookAtTarget(el);
        afterLayout(() => {
          syncCanvasSize();
          lookAtTarget(el);
        });
        return;
      }

      mobileDocked = false;
      root.classList.remove("sg-mobile");
      stage.classList.toggle("sg-stack", false);
      const sw = stage.offsetWidth || 500;
      const sh = stage.offsetHeight || 240;
      const r = el.getBoundingClientRect();

      const spaceBelow = vh - r.bottom;
      const spaceAbove = r.top;
      const spaceLeft = r.left;
      const spaceRight = vw - r.right;

      let left;
      let top;
      let faceLeft = false;

      if (spaceBelow < sh + gap && spaceAbove < sh + gap) {
        if (spaceLeft >= sw + gap || spaceLeft > spaceRight) {
          left = r.left - sw - gap;
          top = clamp(r.top + r.height / 2 - sh / 2, margin, vh - sh - margin);
        } else {
          left = r.right + gap;
          top = clamp(r.top + r.height / 2 - sh / 2, margin, vh - sh - margin);
          faceLeft = true;
        }
      } else if (spaceBelow >= sh + gap || spaceBelow >= spaceAbove) {
        top = r.bottom + gap;
        left = clamp(r.left + r.width / 2 - sw / 2, margin, vw - sw - margin);
        faceLeft = r.left + r.width / 2 > vw * 0.55;
      } else {
        top = r.top - sh - gap;
        left = clamp(r.left + r.width / 2 - sw / 2, margin, vw - sw - margin);
        faceLeft = r.left + r.width / 2 > vw * 0.55;
      }

      stage.classList.toggle("sg-facing-left", faceLeft);
      stage.style.left = `${clamp(left, margin, vw - sw - margin)}px`;
      stage.style.top = `${clamp(top, margin, vh - sh - margin)}px`;
      stage.style.bottom = "";
      stage.style.right = "";
      if (hop) hopGuide(true);
      lookAtTarget(el);
      afterLayout(() => {
        syncCanvasSize();
        lookAtTarget(el);
      });
    }

    function clearHighlight() {
      if (lastTarget) {
        lastTarget.classList.remove("sg-target");
        lastTarget = null;
      }
      spotlight.classList.remove("sg-visible");
      spotlight.style.opacity = "0";
    }

    function measureAndPlace(el, { hop = false } = {}) {
      if (isMobile()) {
        dockMobileSheet({ hop });
        scrollTargetIntoSafeView(el);
      }

      updateSpotlightRect(el);
      placeGuideNear(el, { hop: false });
    }

    function syncLayout(step) {
      if (!step?.target) {
        clearHighlight();
        spotlight.style.top = "50%";
        spotlight.style.left = "50%";
        spotlight.style.width = "0px";
        spotlight.style.height = "0px";
        spotlight.style.opacity = "1";
        spotlight.classList.add("sg-visible");
        placeGuideDefault();
        return;
      }
      const el = document.querySelector(step.target);
      if (el) measureAndPlace(el, { hop: false });
    }

    function placeSpotlight(selector) {
      clearHighlight();
      clearTimeout(placeTimer);
      if (!selector) {
        syncLayout({ target: null });
        return;
      }
      const el = document.querySelector(selector);
      if (!el) {
        placeGuideDefault();
        return;
      }
      if (isMobile()) {
        dockMobileSheet({ hop: true });
        scrollTargetIntoSafeView(el);
        // One delayed remeasure after scroll — no hop storm while text types
        placeTimer = setTimeout(() => {
          measureAndPlace(el, { hop: false });
          placeTimer = setTimeout(() => {
            if (lastTarget === el || document.querySelector(selector) === el) {
              updateSpotlightRect(el);
              lookAtTarget(el);
            }
          }, 280);
        }, 260);
      } else {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        placeTimer = setTimeout(() => {
          measureAndPlace(el, { hop: true });
        }, 280);
      }
    }

    function setClickAdvance(on) {
      spotlight.classList.toggle("sg-clickable", on);
      if (hintEl) hintEl.hidden = !on;
    }

    function showStep(index) {
      stepIndex = index;
      const step = opts.steps[index];
      if (!step) {
        end(true);
        return;
      }
      clearGimmicks();
      const last = index === opts.steps.length - 1;
      pillEl.textContent = `${index + 1} / ${opts.steps.length}`;
      btnNext.textContent =
        step.nextLabel || (last ? opts.doneLabel : opts.nextLabel || "Next");
      if (progressEl) {
        progressEl.style.width = `${((index + 1) / opts.steps.length) * 100}%`;
      }
      const wantClick =
        (step.waitForClick != null ? step.waitForClick : opts.advanceOnClick) &&
        !!step.target;
      setClickAdvance(!!wantClick);
      // Allow host page to open modals / tabs before spotlight measures
      opts.onBeforeStep?.(step, index);
      opts.onStep?.(step, index);
      placeSpotlight(step.target || null);
      applyPerformance(step);
      typeLine(step.line || "");
    }

    function next() {
      const step = opts.steps[stepIndex];
      if (!step) return;
      if (skipTyping(step.line || "")) return;
      if (stepIndex >= opts.steps.length - 1) {
        end(true);
        return;
      }
      showStep(stepIndex + 1);
    }

    function prev() {
      if (stepIndex <= 0) return;
      showStep(stepIndex - 1);
    }

    function goTo(index) {
      if (index < 0 || index >= opts.steps.length) return;
      showStep(index);
    }

    function replayPose() {
      const step = opts.steps[stepIndex];
      if (!step) return;
      const poseId = typeof step.pose === "number" ? step.pose : 0;
      showTag(poseLabel(step));
      playPose(poseId, true);
      hopGuide();
      later(100, () => runFace(step.face));
    }

    function end(completed) {
      if (!active) return;
      active = false;
      clearHighlight();
      clearGimmicks();
      clearInterval(typeTimer);
      clearTimeout(placeTimer);
      canvasWrap.classList.add("sg-exit");
      document.body.classList.remove("sg-active");
      if (completed && opts.storageKey) {
        try {
          global.localStorage?.setItem(opts.storageKey, "1");
        } catch (_) {}
      }
      setTimeout(() => {
        root.hidden = true;
        root.classList.add("sg-done");
        canvasWrap.classList.remove("sg-exit");
        if (completed) opts.onComplete?.();
        else opts.onSkip?.();
        opts.onEnd?.(completed);
      }, 420);
    }

    function start() {
      if (destroyed) return;
      root.classList.remove("sg-done");
      root.hidden = false;
      document.body.classList.add("sg-active");
      canvasWrap.classList.remove("sg-exit");
      active = true;
      mobileDocked = false;
      lastCanvasW = 0;
      lastCanvasH = 0;
      if (isMobile()) dockMobileSheet({ hop: false });
      // Un-hiding changes layout; re-fit bust after CSS paints
      afterLayout(() => {
        syncCanvasSize(true);
        showStep(0);
      });
      opts.onStart?.();
    }

    function destroy() {
      destroyed = true;
      active = false;
      clearGimmicks();
      clearInterval(typeTimer);
      clearTimeout(resizeTimer);
      clearTimeout(placeTimer);
      clearHighlight();
      document.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("sg-active");
      try {
        app?.destroy(true);
      } catch (_) {}
      app = null;
      model = null;
      root.remove();
    }

    function onKey(e) {
      if (!active || root.hidden) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        next();
      }
      if (e.key === "Escape") end(false);
    }

    btnNext.addEventListener("click", next);
    btnSkip?.addEventListener("click", () => end(false));
    btnPose?.addEventListener("click", replayPose);
    canvasWrap.addEventListener("pointerdown", (e) => {
      if (!active) return;
      e.preventDefault();
      replayPose();
    });
    spotlight.addEventListener("click", () => {
      if (active && spotlight.classList.contains("sg-clickable")) next();
    });
    if (opts.keyboard) document.addEventListener("keydown", onKey);

    try {
      await initModel();
    } catch (err) {
      // Model failed to load — clean up so we don't leak a dead overlay
      try {
        app?.destroy(true);
      } catch (_) {}
      app = null;
      if (opts.keyboard) document.removeEventListener("keydown", onKey);
      root.remove();
      throw err;
    }

    const api = {
      start,
      next,
      prev,
      goTo,
      replayPose,
      end: () => end(false),
      destroy,
      getIndex: () => stepIndex,
      isActive: () => active,
      get root() {
        return root;
      },
      get model() {
        return model;
      },
    };

    if (opts.autoStart) start();
    return api;
  }

  const ShivamGuide = { create, ensurePeers, DEFAULT_POSES, PEERS };
  global.ShivamGuide = ShivamGuide;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ShivamGuide;
  }
})(typeof window !== "undefined" ? window : globalThis);
