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

  const PIXI_PEER = {
    id: "pixi",
    src: "https://cdn.jsdelivr.net/npm/pixi.js@6.5.10/dist/browser/pixi.min.js",
    ready: () => !!global.PIXI,
  };

  const PEERS_BY_VER = {
    2: [
      {
        id: "cubism2-core",
        src: "https://cdn.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js",
        ready: () => !!global.Live2D,
      },
      PIXI_PEER,
      {
        id: "cubism2",
        src: "https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/cubism2.min.js",
        ready: () => !!(global.PIXI && global.PIXI.live2d),
      },
    ],
    4: [
      {
        id: "cubism-core",
        src: "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js",
        ready: () => !!(global.Live2DCubismCore || global.Live2DCubismFramework),
      },
      PIXI_PEER,
      {
        id: "cubism4",
        src: "https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/cubism4.min.js",
        ready: () => !!(global.PIXI && global.PIXI.live2d),
      },
    ],
  };

  // Kept for backward compat (exposed on ShivamGuide.PEERS)
  const PEERS = PEERS_BY_VER[4];

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

  /** Inject Cubism + Pixi + display lib from CDN when missing (browser only). */
  async function ensurePeers(ver) {
    if (typeof document === "undefined") {
      throw new Error("ShivamGuide: peers need a browser document");
    }
    const peers = PEERS_BY_VER[ver] || PEERS_BY_VER[4];
    for (const peer of peers) {
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
        cubism: 4,
        lipSync: true,
        loadPeers: true,
        mount: null,
        storageKey: null,
        zIndex: 9999,
        // --- Customization ---
        theme: null,
        typeSpeedMs: 32,
        spotlightPadding: 12,
        spotlightRadius: null,
        keyboard: true,
        advanceOnClick: false,
        clickHint: "Tap the highlighted area",
        reduceMotion: "auto",
        mobileScale: 1,
        desktopScale: 1,
        modelAnchorY: 0.62,
        mobileAnchorY: 0.44,
        mobileModelScale: 2.45,
        debug: false,
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
      await ensurePeers(opts.cubism);
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
    let motionCatalog = [];
    let exprCatalog = [];
    let motionByName = Object.create(null);
    let exprByName = Object.create(null);

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
      model.scale.set(1);

      if (mobile) {
        const naturalH = Math.max(model.height, 1);
        const naturalW = Math.max(model.width, 1);
        const mms = opts.mobileModelScale || 2.45;
        const scale =
          Math.max((h * mms) / naturalH, (w * 1.2) / naturalW) *
          (opts.mobileScale || 1);
        model.scale.set(scale);
        model.x = w * 0.5;
        const drawnH = model.height;
        const anchorY = opts.mobileAnchorY ?? 0.44;
        model.y = drawnH < h ? h * 0.55 : drawnH * anchorY;
      } else {
        const scale =
          Math.min(w / model.width, h / model.height) * 1.15 * (opts.desktopScale || 1);
        model.scale.set(scale);
        model.x = w * 0.5;
        model.y = h * (opts.modelAnchorY ?? 0.62);
      }
    }

    let hopCooldownUntil = 0;
    let resizeTimer = null;
    let placeTimer = null;
    let lastCanvasW = 0;
    let lastCanvasH = 0;

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

    /**
     * Smoothly scroll the page to `top`, calling onFrame each frame so the
     * spotlight can follow, then onDone once the scroll settles.
     */
    function animateScrollTo(top, onFrame, onDone, maxMs = 520) {
      const scroller = document.scrollingElement || document.documentElement;
      const start = scroller.scrollTop;
      const dist = top - start;
      if (Math.abs(dist) <= 2) {
        onFrame && onFrame();
        onDone && onDone();
        return;
      }
      // Drive the scroll ourselves (instead of native smooth + polling) so we
      // get a deterministic frame on every tick and can keep the spotlight
      // glued to the target — and always land exactly on `top`.
      if (reduceMotion) {
        scroller.scrollTop = top;
        onFrame && onFrame();
        onDone && onDone();
        return;
      }
      const dur = Math.min(maxMs, Math.max(220, Math.abs(dist) * 0.6));
      const ease = (t) => 1 - Math.pow(1 - t, 3);
      const t0 = performance.now();
      (function step() {
        if (destroyed) return;
        const p = Math.min(1, (performance.now() - t0) / dur);
        scroller.scrollTop = start + dist * ease(p);
        onFrame && onFrame();
        if (p < 1) {
          requestAnimationFrame(step);
        } else {
          scroller.scrollTop = top;
          onFrame && onFrame();
          onDone && onDone();
        }
      })();
    }

    /** Bottom-centered card for the intro / no-target step on phones. */
    function placeMobileDefault() {
      root.classList.add("sg-mobile");
      stage.classList.remove("sg-facing-left", "sg-stack");
      const vw = window.innerWidth;
      const margin = 8;
      const sw = stage.offsetWidth || Math.min(360, vw - 16);
      stage.style.left = `${clamp((vw - sw) / 2, margin, vw - sw - margin)}px`;
      stage.style.right = "";
      stage.style.top = "auto";
      stage.style.bottom = `calc(${margin}px + env(safe-area-inset-bottom, 0px))`;
    }

    /**
     * Phones: place the compact card right NEXT TO the target (just above or
     * below it, as a centered pair) so the guide stays near what it points at —
     * like desktop. If the target + card can't both fit that way, fall back to
     * docking the card at the far edge so the spotlight is still never covered.
     */
    function placeGuideMobile(el, { scroll = true } = {}) {
      root.classList.add("sg-mobile");
      stage.classList.remove("sg-facing-left", "sg-stack");

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const m = 8;
      const g = 12;
      const pad = opts.spotlightPadding ?? 12;
      const ring = 10;
      const P = pad + ring;

      const sw = stage.offsetWidth || Math.min(360, vw - 16);
      const sh = stage.offsetHeight || 180;

      const scroller = document.scrollingElement || document.documentElement;
      const maxScroll = scroll
        ? Math.max(0, scroller.scrollHeight - scroller.clientHeight)
        : scroller.scrollTop; // no-scroll mode: pin reqScroll to current
      const minScroll = scroll ? 0 : scroller.scrollTop;
      const cur = scroller.scrollTop;

      const r = el.getBoundingClientRect();
      const blockH = r.height + P * 2; // target + spotlight ring
      const blockDocTop = cur + r.top - P;
      const groupH = blockH + g + sh; // target + gap + card

      // Adjacent placement: center the (target + card) pair, card touching the
      // target on `side`. Anchor the card on its OUTER edge so if the dialogue
      // grows (longer text) it expands away from the target, never over it.
      function near(side) {
        const groupTop = clamp((vh - groupH) / 2, m, Math.max(m, vh - m - groupH));
        const blockVpTop = side === "below" ? groupTop : groupTop + sh + g;
        const reqScroll = clamp(blockDocTop - blockVpTop, minScroll, maxScroll);
        const blockTop = blockDocTop - reqScroll;
        const blockBottom = blockTop + blockH;
        const cardTop = side === "below" ? blockBottom + g : blockTop - g - sh;
        const cardBottom = cardTop + sh;
        const fits =
          cardTop >= m - 1 &&
          cardBottom <= vh - m + 1 &&
          blockTop >= m - 1 &&
          blockBottom <= vh - m + 1;
        return { mode: "near", side, reqScroll, blockTop, blockBottom, cardTop, cardBottom, fits };
      }

      // Prefer the side the target leans toward so it only travels a little.
      const order = r.top < vh * 0.5 ? ["below", "above"] : ["above", "below"];
      let plan = null;
      for (const s of order) {
        const c = near(s);
        if (c.fits) {
          plan = c;
          break;
        }
      }

      // Fallback: dock at the edge opposite the target (guarantees no cover).
      if (!plan) {
        const edge = (side) => {
          const bandTop = side === "bottom" ? m : sh + g;
          const bandBottom = side === "bottom" ? vh - sh - g : vh - m;
          const bandH = Math.max(0, bandBottom - bandTop);
          const desiredVpTop = bandTop + Math.max(0, (bandH - blockH) / 2);
          const reqScroll = clamp(blockDocTop - desiredVpTop, minScroll, maxScroll);
          const vpTop = blockDocTop - reqScroll;
          const vpBottom = vpTop + blockH;
          const visible =
            Math.max(0, Math.min(vpBottom, bandBottom) - Math.max(vpTop, bandTop));
          return { mode: "edge", side, reqScroll, visible };
        };
        plan = [edge("bottom"), edge("top")].sort((a, b) => b.visible - a.visible)[0];
      }

      // Position the card horizontally centered, anchored per the plan.
      const left = clamp((vw - sw) / 2, m, vw - sw - m);
      stage.style.left = `${left}px`;
      stage.style.right = "";
      if (plan.mode === "edge") {
        if (plan.side === "bottom") {
          stage.style.top = "auto";
          stage.style.bottom = `calc(${m}px + env(safe-area-inset-bottom, 0px))`;
        } else {
          stage.style.bottom = "auto";
          stage.style.top = `${m}px`;
        }
      } else if (plan.side === "below") {
        // card below target → anchor its TOP (grows downward, away from target)
        stage.style.bottom = "auto";
        stage.style.top = `${Math.round(plan.cardTop)}px`;
      } else {
        // card above target → anchor its BOTTOM (grows upward, away from target)
        stage.style.top = "auto";
        stage.style.bottom = `${Math.round(vh - plan.cardBottom)}px`;
      }

      // Follow the target with the spotlight while scrolling, then lock it in.
      // Only kill transitions while actually scrolling — otherwise let the ring
      // slide smoothly between steps (like desktop).
      const willScroll = Math.abs(plan.reqScroll - cur) > 2;
      if (willScroll) spotlight.classList.add("sg-notrans");
      animateScrollTo(
        plan.reqScroll,
        () => {
          if (willScroll) updateSpotlightRect(el);
        },
        () => {
          updateSpotlightRect(el);
          lookAtTarget(el);
          if (willScroll) {
            requestAnimationFrame(() => spotlight.classList.remove("sg-notrans"));
          }
        }
      );
      afterLayout(() => syncCanvasSize());
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
      if (PIXI.utils?.skipHello) PIXI.utils.skipHello();
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

      // --- One-time introspection: build motion + expression catalogs ---
      motionCatalog = [];
      motionByName = Object.create(null);
      const allDefs = model.internalModel?.motionManager?.definitions || {};
      for (const group of Object.keys(allDefs)) {
        (allDefs[group] || []).forEach((def, i) => {
          const file = def?.file || def?.File || "";
          const name = file
            .replace(/^.*[\\/]/, "")
            .replace(/\.motion3\.json$/i, "")
            .replace(/\.mtn$/i, "")
            .replace(/\.\w+$/, "");
          const entry = { group, index: i, name, file };
          motionCatalog.push(entry);
          if (name) motionByName[name] = entry;
        });
      }

      exprCatalog = [];
      exprByName = Object.create(null);
      const eDefs =
        model.internalModel?.motionManager?.expressionManager?.definitions || [];
      eDefs.forEach((def, i) => {
        const raw = def?.name || def?.Name || "";
        const name = raw.replace(/\.exp\d?\.json$/i, "") || "expr_" + i;
        const entry = { index: i, name, file: def?.file || def?.File || "" };
        exprCatalog.push(entry);
        exprByName[name] = entry;
      });

      if (opts.debug) {
        console.log("ShivamGuide motions:", motionCatalog);
        console.log("ShivamGuide expressions:", exprCatalog);
      }

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
      // never re-hop / re-scroll the guide (that looked like it was reloading).
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!app || destroyed) return;
        syncCanvasSize();
        if (!active) return;
        const step = opts.steps[stepIndex];
        const el = step?.target ? document.querySelector(step.target) : null;
        if (el) {
          updateSpotlightRect(el);
          // Re-flip the card if orientation changed it under the target,
          // but don't yank the scroll position around.
          if (isMobile()) placeGuideMobile(el, { scroll: false });
          else lookAtTarget(el);
        }
      }, 180);
    }

    function resolvePose(spec) {
      if (spec == null) return { group: "", index: 0 };
      // "group:index" string
      if (typeof spec === "string" && spec.includes(":")) {
        const [g, i] = spec.split(":");
        return { group: g, index: parseInt(i, 10) || 0 };
      }
      // name string — O(1) lookup
      if (typeof spec === "string") {
        const hit = motionByName[spec];
        if (hit) return { group: hit.group, index: hit.index };
        console.warn(
          `ShivamGuide: motion "${spec}" not found. Available:`,
          motionCatalog.map((m) => m.name).filter(Boolean)
        );
        return { group: "", index: 0 };
      }
      // { group, index } object
      if (typeof spec === "object") {
        return { group: spec.group || "", index: spec.index || 0 };
      }
      // number — flat index into catalog, fallback to "" group
      const flat = typeof spec === "number" ? spec : 0;
      if (motionCatalog.length && flat < motionCatalog.length) {
        return { group: motionCatalog[flat].group, index: motionCatalog[flat].index };
      }
      return { group: "", index: ((flat % 28) + 28) % 28 };
    }

    function playPose(spec, force = true) {
      if (!model) return;
      try {
        const { group, index } = resolvePose(spec);
        model.motion(group, index, force ? 3 : 2);
      } catch (_) {}
    }

    function setExpression(spec) {
      if (!model || spec == null) return;
      try {
        if (typeof spec === "string") {
          const hit = exprByName[spec];
          if (hit) {
            model.expression(hit.index);
          } else {
            console.warn(
              `ShivamGuide: expression "${spec}" not found. Available:`,
              exprCatalog.map((e) => e.name)
            );
          }
          return;
        }
        if (typeof spec === "number") {
          const count = exprCatalog.length || 11;
          model.expression(((spec % count) + count) % count);
        }
      } catch (_) {
        try {
          if (typeof spec === "number") model.expression(spec);
        } catch (__) {}
      }
    }

    function poseLabel(step) {
      if (step.poseName) return `POSE · ${step.poseName}`;
      const spec = step.pose ?? 0;
      // Try user-supplied poses array first (backward compat with DEFAULT_POSES)
      if (typeof spec === "number") {
        const p = (opts.poses || []).find((x) => x.id === spec) || (opts.poses || [])[spec];
        if (p) return `POSE · ${p.name}`;
      }
      // Auto-derive from catalog
      const resolved = resolvePose(spec);
      const entry = motionCatalog.find(
        (m) => m.group === resolved.group && m.index === resolved.index
      );
      if (entry && entry.name && !/^(motion\d+|mtn_\d+)$/i.test(entry.name)) {
        return `POSE · ${entry.name.toUpperCase()}`;
      }
      if (resolved.group) {
        return `POSE · ${resolved.group.toUpperCase()} · ${resolved.index}`;
      }
      return `POSE · #${resolved.index}`;
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
      const pose = step.pose ?? 0;
      showTag(poseLabel(step));
      setExpression(step.expression);
      playPose(pose, true);
      later(90, () => playPose(pose, true));
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
        placeMobileDefault();
        hopGuide(true);
        afterLayout(() => syncCanvasSize());
        return;
      }
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

      // Phones: flip the card above/below the target so it's never covered
      if (isMobile()) {
        placeGuideMobile(el);
        if (hop) hopGuide(true);
        return;
      }

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
      updateSpotlightRect(el);
      placeGuideNear(el, { hop });
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

    function placeSpotlight(selector, onReady) {
      clearHighlight();
      clearTimeout(placeTimer);
      if (!selector) {
        syncLayout({ target: null });
        onReady && onReady();
        return;
      }
      const el = document.querySelector(selector);
      if (!el) {
        placeGuideDefault();
        onReady && onReady();
        return;
      }
      if (isMobile()) {
        measureAndPlace(el, { hop: true });
        onReady && onReady();
      } else {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        placeTimer = setTimeout(() => {
          measureAndPlace(el, { hop: true });
          onReady && onReady();
        }, 280);
      }
    }

    function setClickAdvance(on) {
      spotlight.classList.toggle("sg-clickable", on);
      if (hintEl) hintEl.hidden = !on;
    }

    function showStep(index, onReady) {
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
      opts.onBeforeStep?.(step, index);
      opts.onStep?.(step, index);
      // Clear stale text immediately; typing restarts once the spotlight lands.
      clearInterval(typeTimer);
      textEl.textContent = "";
      // Defer typing + pose until the spotlight is actually placed so the
      // text doesn't start before the user can see what it's referring to.
      placeSpotlight(step.target || null, () => {
        applyPerformance(step);
        typeLine(step.line || "");
        onReady && onReady();
      });
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
      showTag(poseLabel(step));
      playPose(step.pose ?? 0, true);
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
      // Keep stage + spotlight invisible until fully positioned + typing.
      stage.style.opacity = "0";
      spotlight.style.visibility = "hidden";
      root.hidden = false;
      document.body.classList.add("sg-active");
      canvasWrap.classList.remove("sg-exit");
      active = true;
      lastCanvasW = 0;
      lastCanvasH = 0;
      if (isMobile()) placeMobileDefault();
      afterLayout(() => {
        syncCanvasSize(true);
        showStep(0, () => {
          // Everything is positioned and typing has started — reveal.
          spotlight.style.visibility = "";
          stage.style.opacity = "";
        });
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
      try {
        app?.destroy(true);
      } catch (_) {}
      app = null;
      if (opts.keyboard) document.removeEventListener("keydown", onKey);
      // Show a visible error instead of silently dying
      const isMoc2 = /\.moc[^3]|\.moc"/.test(JSON.stringify(err));
      const hint = opts.cubism === 4 && isMoc2
        ? " This looks like a Cubism 2 model (.moc) — try cubism: 2."
        : opts.cubism === 2 && !isMoc2
        ? " This looks like a Cubism 4 model (.moc3) — try cubism: 4."
        : "";
      const msg = `Model failed to load.${hint}`;
      statusEl.textContent = msg;
      statusEl.style.cssText = "color:#f87171;font-size:0.8rem;padding:0.5rem;text-align:center;";
      root.hidden = false;
      stage.style.opacity = "1";
      console.error("ShivamGuide:", err, hint);
      return {
        start() {}, next() {}, prev() {}, goTo() {}, replayPose() {},
        end() {}, destroy() { root.remove(); },
        getIndex: () => -1, isActive: () => false,
        get root() { return root; },
      };
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
      get root() { return root; },
      get model() { return model; },
      get motions() { return motionCatalog; },
      get expressions() { return exprCatalog; },
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
