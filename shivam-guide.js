/**
 * ShivamGuide — engine-agnostic onboarding tour for any website.
 *
 * Supports four character engines:
 *   "live2d"  — PixiJS + Cubism 2/4 (default, backward compatible)
 *   "rive"    — @rive-app/canvas interactive animations
 *   "lottie"  — lottie-web After Effects animations
 *   "photo"   — static image with CSS idle animation (zero deps)
 *
 * Usage:
 *   const tour = await ShivamGuide.create({
 *     engine: 'photo',
 *     photoUrl: '/me.png',
 *     speaker: 'Guide',
 *     steps: [
 *       { line: 'Welcome!', expression: 'smile' },
 *       { target: '#cta', line: 'Tap this button.', nextLabel: 'Got it' },
 *     ],
 *   });
 */
(function (global) {
  "use strict";

  // ─── Utilities ────────────────────────────────────────────────────

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

  // ─── Live2D peer definitions ──────────────────────────────────────

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

  const PEERS = PEERS_BY_VER[4];

  async function ensurePeers(ver) {
    if (typeof document === "undefined") {
      throw new Error("ShivamGuide: peers need a browser document");
    }
    const peers = PEERS_BY_VER[ver] || PEERS_BY_VER[4];
    for (const peer of peers) {
      if (peer.ready()) continue;
      await loadScript(peer.src, peer.id);
      if (!peer.ready()) await new Promise((r) => setTimeout(r, 0));
      if (!peer.ready()) {
        throw new Error(
          "ShivamGuide: peer not available after load (" + peer.id + ")"
        );
      }
    }
  }

  // ─── Default pose labels (backward compat for Natori) ────────────

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

  // ─────────────────────────────────────────────────────────────────
  //  ENGINE ADAPTERS
  //  Each adapter: { init, fit, pose, expression, face, lipSync,
  //                  lookAt, getCatalog, destroy }
  // ─────────────────────────────────────────────────────────────────

  // ── Live2D Adapter ────────────────────────────────────────────────

  function createLive2DAdapter(opts, canvasWrap, statusEl) {
    let model = null;
    let app = null;
    let paramOverrides = Object.create(null);
    let overrideKeys = [];
    let gimmickTimers = [];
    let lipTalking = false;
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

    function later(ms, fn) {
      const id = setTimeout(fn, ms);
      gimmickTimers.push(id);
      return id;
    }

    function resolvePose(spec) {
      if (spec == null) return { group: "", index: 0 };
      if (typeof spec === "string" && spec.includes(":")) {
        const [g, i] = spec.split(":");
        return { group: g, index: parseInt(i, 10) || 0 };
      }
      if (typeof spec === "string") {
        const hit = motionByName[spec];
        if (hit) return { group: hit.group, index: hit.index };
        console.warn(
          `ShivamGuide: motion "${spec}" not found. Available:`,
          motionCatalog.map((m) => m.name).filter(Boolean)
        );
        return { group: "", index: 0 };
      }
      if (typeof spec === "object" && spec !== null) {
        return { group: spec.group || "", index: spec.index || 0 };
      }
      const flat = typeof spec === "number" ? spec : 0;
      if (motionCatalog.length && flat < motionCatalog.length) {
        return { group: motionCatalog[flat].group, index: motionCatalog[flat].index };
      }
      return { group: "", index: ((flat % 28) + 28) % 28 };
    }

    return {
      get model() { return model; },
      get app() { return app; },

      async init() {
        if (opts.loadPeers !== false) await ensurePeers(opts.cubism);
        if (!global.PIXI?.live2d) {
          throw new Error("ShivamGuide: Cubism/Pixi peers missing");
        }
        const { Live2DModel } = PIXI.live2d;
        if (PIXI.utils?.skipHello) PIXI.utils.skipHello();
        const mobile = window.innerWidth < 640;
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
        statusEl.textContent = "Loading model\u2026";

        model = await Live2DModel.from(opts.modelUrl, { autoInteract: false });
        statusEl.textContent = "";
        this.fit();
        app.stage.addChild(model);

        // Introspect motions
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

        // Introspect expressions
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
            setParam(overrideKeys[k], paramOverrides[overrideKeys[k]]);
          }
        });
      },

      fit() {
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
      },

      syncCanvasSize(force, lastW, lastH) {
        if (!app) return { changed: false, w: lastW, h: lastH };
        const cw = canvasWrap.clientWidth;
        const ch = canvasWrap.clientHeight;
        if (cw < 8 || ch < 8) return { changed: false, w: lastW, h: lastH };
        if (!force && cw === lastW && ch === lastH) return { changed: false, w: lastW, h: lastH };
        app.renderer.resize(cw, ch);
        this.fit();
        return { changed: true, w: cw, h: ch };
      },

      pose(spec) {
        if (!model) return;
        try {
          const { group, index } = resolvePose(spec);
          model.motion(group, index, 3);
        } catch (_) {}
      },

      poseLabel(step) {
        if (step.poseName) return `POSE \xb7 ${step.poseName}`;
        const spec = step.pose ?? 0;
        if (typeof spec === "number") {
          const p = (opts.poses || []).find((x) => x.id === spec) || (opts.poses || [])[spec];
          if (p) return `POSE \xb7 ${p.name}`;
        }
        const resolved = resolvePose(spec);
        const entry = motionCatalog.find(
          (m) => m.group === resolved.group && m.index === resolved.index
        );
        if (entry && entry.name && !/^(motion\d+|mtn_\d+)$/i.test(entry.name)) {
          return `POSE \xb7 ${entry.name.toUpperCase()}`;
        }
        if (resolved.group) {
          return `POSE \xb7 ${resolved.group.toUpperCase()} \xb7 ${resolved.index}`;
        }
        return `POSE \xb7 #${resolved.index}`;
      },

      expression(spec) {
        if (!model || spec == null) return;
        try {
          if (typeof spec === "string") {
            const hit = exprByName[spec];
            if (hit) model.expression(hit.index);
            else console.warn(`ShivamGuide: expression "${spec}" not found. Available:`, exprCatalog.map((e) => e.name));
            return;
          }
          if (typeof spec === "number") {
            const count = exprCatalog.length || 11;
            model.expression(((spec % count) + count) % count);
          }
        } catch (_) {
          try { if (typeof spec === "number") model.expression(spec); } catch (__) {}
        }
      },

      face(name) {
        this.clearGimmicks();
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
        }
      },

      lipSync(talking, char) {
        lipTalking = talking;
        if (!model) return;
        if (!talking) {
          holdParam("ParamMouthOpenY", 0);
          later(200, () => releaseParams("ParamMouthOpenY"));
          return;
        }
        const open = /[aeiouAEIOU]/.test(char) ? 0.7 : /[\s.,!?]/.test(char) ? 0.05 : 0.35;
        holdParam("ParamMouthOpenY", open);
      },

      lookAt(x, y) {
        if (model) model.focus(x, y);
      },

      clearGimmicks() {
        gimmickTimers.forEach(clearTimeout);
        gimmickTimers = [];
        lipTalking = false;
        releaseParams();
        setParam("ParamMouthOpenY", 0);
      },

      getCatalog() {
        return { motions: motionCatalog, expressions: exprCatalog };
      },

      destroy() {
        this.clearGimmicks();
        try { app?.destroy(true); } catch (_) {}
        app = null;
        model = null;
      },
    };
  }

  // ── Photo Adapter ─────────────────────────────────────────────────

  function createPhotoAdapter(opts, canvasWrap, statusEl) {
    let imgEl = null;
    let currentExpr = "default";
    let talkClass = false;
    const photos = opts.photos || {};
    const defaultUrl = opts.photoUrl || "";

    function getUrl(expr) {
      return photos[expr] || defaultUrl;
    }

    return {
      get model() { return imgEl; },
      get app() { return null; },

      async init() {
        statusEl.textContent = "Loading\u2026";
        imgEl = document.createElement("img");
        imgEl.className = "sg-photo-character";
        imgEl.draggable = false;
        imgEl.alt = opts.speaker || "Guide";
        imgEl.src = defaultUrl;

        await new Promise((resolve, reject) => {
          imgEl.onload = resolve;
          imgEl.onerror = () => reject(new Error("ShivamGuide: photo failed to load — " + defaultUrl));
        });
        statusEl.textContent = "";
        canvasWrap.appendChild(imgEl);
        canvasWrap.classList.add("sg-photo-canvas");

        // Preload expression images
        for (const key of Object.keys(photos)) {
          if (photos[key] === defaultUrl) continue;
          const pre = new Image();
          pre.src = photos[key];
        }

        if (opts.debug) {
          console.log("ShivamGuide photo expressions:", ["default", ...Object.keys(photos)]);
        }
      },

      fit() {},

      syncCanvasSize(force, lastW, lastH) {
        return { changed: false, w: lastW, h: lastH };
      },

      pose() {},

      poseLabel(step) {
        if (step.poseName) return step.poseName;
        return opts.speaker || "Guide";
      },

      expression(spec) {
        if (spec == null) return;
        const name = typeof spec === "number" ? Object.keys(photos)[spec] || "default" : String(spec);
        const url = getUrl(name);
        if (imgEl && url && imgEl.src !== url) {
          imgEl.src = url;
          currentExpr = name;
        }
      },

      face() {},

      lipSync(talking) {
        if (!imgEl) return;
        if (talking && !talkClass) {
          imgEl.classList.add("sg-photo-talk");
          talkClass = true;
        } else if (!talking && talkClass) {
          imgEl.classList.remove("sg-photo-talk");
          talkClass = false;
        }
      },

      lookAt() {},

      clearGimmicks() {
        if (imgEl) imgEl.classList.remove("sg-photo-talk");
        talkClass = false;
      },

      getCatalog() {
        const expressions = ["default", ...Object.keys(photos)].map((name, i) => ({
          index: i,
          name,
          file: name === "default" ? defaultUrl : photos[name],
        }));
        return { motions: [], expressions };
      },

      destroy() {
        if (imgEl && imgEl.parentNode) imgEl.parentNode.removeChild(imgEl);
        imgEl = null;
      },
    };
  }

  // ── Rive Adapter ──────────────────────────────────────────────────

  function createRiveAdapter(opts, canvasWrap, statusEl) {
    let rive = null;
    let riveInstance = null;
    let canvas = null;
    let inputs = {};
    let stateMachines = [];

    return {
      get model() { return riveInstance; },
      get app() { return null; },

      async init() {
        statusEl.textContent = "Loading Rive\u2026";
        if (!global.rive) {
          await loadScript(
            "https://unpkg.com/@rive-app/canvas@2.23.10",
            "rive-runtime"
          );
          if (!global.rive) {
            await new Promise((r) => setTimeout(r, 100));
          }
          if (!global.rive) {
            throw new Error("ShivamGuide: Rive runtime failed to load");
          }
        }
        rive = global.rive;

        canvas = document.createElement("canvas");
        canvas.className = "sg-rive-canvas";
        canvas.style.cssText = "width:100%;height:100%;display:block;cursor:pointer;pointer-events:auto;background:transparent;";
        canvasWrap.appendChild(canvas);

        const riveUrl = opts.riveUrl;
        if (!riveUrl) throw new Error("ShivamGuide: riveUrl is required for engine:'rive'");

        await new Promise((resolve, reject) => {
          let settled = false;
          const done = (fn) => { if (!settled) { settled = true; fn(); } };

          const riveOpts = {
            src: riveUrl,
            canvas: canvas,
            autoplay: true,
            onLoad: () => done(() => {
              statusEl.textContent = "";
              try {
                riveInstance.resizeDrawingSurfaceToCanvas();
              } catch (_) {}
              try {
                const smNames = riveInstance.stateMachineNames || [];
                smNames.forEach((name) => {
                  const smInputs = riveInstance.stateMachineInputs(name) || [];
                  smInputs.forEach((inp) => { inputs[inp.name] = inp; });
                });
                stateMachines = smNames;
              } catch (_) {}

              if (opts.debug) {
                console.log("ShivamGuide Rive state machines:", stateMachines);
                console.log("ShivamGuide Rive inputs:", Object.keys(inputs));
              }
              resolve();
            }),
            onLoadError: (e) => done(() => reject(new Error("ShivamGuide: Rive load error \u2014 " + e))),
          };

          if (opts.riveStateMachine) {
            riveOpts.stateMachines = opts.riveStateMachine;
          }

          try {
            riveInstance = new rive.Rive(riveOpts);
          } catch (e) {
            done(() => reject(new Error("ShivamGuide: Rive init error \u2014 " + e.message)));
          }
          setTimeout(() => done(() => reject(new Error("ShivamGuide: Rive load timeout"))), 15000);
        });
      },

      fit() {
        if (canvas) {
          canvas.width = canvasWrap.clientWidth * (global.devicePixelRatio || 1);
          canvas.height = canvasWrap.clientHeight * (global.devicePixelRatio || 1);
          if (riveInstance) riveInstance.resizeDrawingSurfaceToCanvas();
        }
      },

      syncCanvasSize(force, lastW, lastH) {
        const cw = canvasWrap.clientWidth;
        const ch = canvasWrap.clientHeight;
        if (cw < 8 || ch < 8) return { changed: false, w: lastW, h: lastH };
        if (!force && cw === lastW && ch === lastH) return { changed: false, w: lastW, h: lastH };
        this.fit();
        return { changed: true, w: cw, h: ch };
      },

      pose(spec) {
        if (!riveInstance) return;
        const name = typeof spec === "string" ? spec : typeof spec === "number" ? String(spec) : null;
        if (name && inputs[name]) {
          try { inputs[name].fire(); } catch (_) {}
        }
      },

      poseLabel(step) {
        if (step.poseName) return step.poseName;
        const spec = step.pose;
        if (typeof spec === "string") return spec.toUpperCase();
        return opts.speaker || "Guide";
      },

      expression(spec) {
        if (!riveInstance || spec == null) return;
        const name = String(spec);
        if (inputs[name]) {
          try {
            if (typeof inputs[name].value === "boolean") inputs[name].value = true;
            else inputs[name].fire();
          } catch (_) {}
        }
      },

      face() {},

      lipSync(talking) {
        if (inputs["isTalking"]) {
          try { inputs["isTalking"].value = talking; } catch (_) {}
        }
      },

      lookAt(x, y) {
        if (!canvas) return;
        const r = canvas.getBoundingClientRect();
        const nx = clamp((x - r.left) / r.width, 0, 1);
        const ny = clamp((y - r.top) / r.height, 0, 1);
        if (inputs["mouseX"]) try { inputs["mouseX"].value = nx * 100; } catch (_) {}
        if (inputs["mouseY"]) try { inputs["mouseY"].value = ny * 100; } catch (_) {}
      },

      clearGimmicks() {
        if (inputs["isTalking"]) {
          try { inputs["isTalking"].value = false; } catch (_) {}
        }
      },

      getCatalog() {
        const motions = Object.keys(inputs)
          .filter((n) => !["mouseX", "mouseY", "isTalking"].includes(n))
          .map((name, i) => ({ group: "input", index: i, name, file: "" }));
        return { motions, expressions: [] };
      },

      destroy() {
        try { riveInstance?.cleanup(); } catch (_) {}
        riveInstance = null;
        if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
        canvas = null;
      },
    };
  }

  // ── Lottie Adapter ────────────────────────────────────────────────

  function createLottieAdapter(opts, canvasWrap, statusEl) {
    let anim = null;
    let container = null;
    let segments = {};
    let talkClass = false;
    let introDone = false;
    const idleFrom = opts.lottieIdleFrom != null ? opts.lottieIdleFrom : null;

    return {
      get model() { return anim; },
      get app() { return null; },

      async init() {
        statusEl.textContent = "Loading Lottie\u2026";
        if (!global.lottie) {
          await loadScript(
            "https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js",
            "lottie-web"
          );
          if (!global.lottie) {
            await new Promise((r) => setTimeout(r, 100));
          }
          if (!global.lottie) {
            throw new Error("ShivamGuide: lottie-web failed to load");
          }
        }

        container = document.createElement("div");
        container.className = "sg-lottie-container";
        container.style.cssText = "width:100%;height:100%;cursor:pointer;pointer-events:auto;";
        canvasWrap.appendChild(container);

        const lottieUrl = opts.lottieUrl;
        if (!lottieUrl) throw new Error("ShivamGuide: lottieUrl is required for engine:'lottie'");

        await new Promise((resolve, reject) => {
          let settled = false;
          const done = (fn) => { if (!settled) { settled = true; fn(); } };

          anim = global.lottie.loadAnimation({
            container: container,
            renderer: "svg",
            loop: idleFrom == null,
            autoplay: true,
            path: lottieUrl,
          });

          if (idleFrom != null) {
            anim.addEventListener("complete", () => {
              if (!introDone) {
                introDone = true;
                anim.loop = true;
                anim.playSegments([idleFrom, anim.totalFrames], true);
                if (opts.debug) console.log("ShivamGuide Lottie: intro done, looping idle from frame", idleFrom);
              }
            });
          }

          const onReady = () => done(() => {
            statusEl.textContent = "";
            if (anim.markers && anim.markers.length) {
              anim.markers.forEach((m, i) => {
                segments[m.cm || m.tm || "segment_" + i] = {
                  start: m.tm,
                  end: m.tm + (m.dr || 30),
                  name: m.cm || "segment_" + i,
                };
              });
            }
            if (opts.lottieSegments) Object.assign(segments, opts.lottieSegments);
            if (opts.debug) {
              console.log("ShivamGuide Lottie markers:", segments);
              console.log("ShivamGuide Lottie totalFrames:", anim.totalFrames);
            }
            resolve();
          });
          anim.addEventListener("DOMLoaded", onReady);
          anim.addEventListener("data_ready", onReady);
          anim.addEventListener("data_failed", () => done(() => reject(new Error("ShivamGuide: Lottie JSON failed to load from " + lottieUrl))));
          anim.addEventListener("error", (e) => {
            if (opts.debug) console.warn("ShivamGuide: Lottie non-fatal error", e);
          });
          setTimeout(() => done(() => reject(new Error("ShivamGuide: Lottie load timeout"))), 15000);
        });
      },

      fit() {},

      syncCanvasSize(force, lastW, lastH) {
        return { changed: false, w: lastW, h: lastH };
      },

      pose(spec) {
        if (!anim) return;
        const playAndReturnToIdle = (start, end) => {
          anim.loop = false;
          anim.playSegments([start, end], true);
          if (idleFrom != null) {
            const onSegDone = () => {
              anim.removeEventListener("complete", onSegDone);
              anim.loop = true;
              anim.playSegments([idleFrom, anim.totalFrames], true);
            };
            anim.addEventListener("complete", onSegDone);
          }
        };
        if (typeof spec === "string" && segments[spec]) {
          const s = segments[spec];
          playAndReturnToIdle(s.start, s.end);
          return;
        }
        if (typeof spec === "number") {
          const keys = Object.keys(segments);
          if (keys[spec]) {
            const s = segments[keys[spec]];
            playAndReturnToIdle(s.start, s.end);
            return;
          }
          anim.goToAndPlay(spec, true);
        }
      },

      poseLabel(step) {
        if (step.poseName) return step.poseName;
        const spec = step.pose;
        if (typeof spec === "string") return spec.toUpperCase();
        return opts.speaker || "Guide";
      },

      expression(spec) {
        this.pose(spec);
      },

      face() {},

      lipSync(talking) {
        if (!anim) return;
        if (talking) {
          anim.setSpeed(1.5);
          if (container && !talkClass) {
            container.classList.add("sg-lottie-talk");
            talkClass = true;
          }
        } else {
          anim.setSpeed(1);
          if (container && talkClass) {
            container.classList.remove("sg-lottie-talk");
            talkClass = false;
          }
        }
      },

      lookAt() {},

      clearGimmicks() {
        if (anim) anim.setSpeed(1);
        if (container) container.classList.remove("sg-lottie-talk");
        talkClass = false;
      },

      getCatalog() {
        const motions = Object.entries(segments).map(([name, s], i) => ({
          group: "marker",
          index: i,
          name,
          file: "",
        }));
        return { motions, expressions: [] };
      },

      destroy() {
        try { anim?.destroy(); } catch (_) {}
        anim = null;
        if (container && container.parentNode) container.parentNode.removeChild(container);
        container = null;
      },
    };
  }

  // ─── DOM helpers ──────────────────────────────────────────────────

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

    const showTag = opts.engine !== "photo";

    root.innerHTML = `
      <div class="sg-spotlight" data-sg="spotlight"></div>
      <div class="sg-hitblock" data-sg="hitblock" aria-hidden="true"></div>
      <div class="sg-stage" data-sg="stage">
        <div class="sg-guide">
          <div class="sg-canvas" data-sg="canvas">
            <div class="sg-status" data-sg="status">Loading\u2026</div>
          </div>
        </div>
        <div class="sg-dialogue">
          <div class="sg-meta">
            <div class="sg-speaker-block">
              <span class="sg-speaker" data-sg="speaker">${escapeHtml(opts.speaker)}</span>
              ${showTag ? '<span class="sg-tag" data-sg="tag">pose</span>' : ""}
            </div>
            <span class="sg-pill" data-sg="pill">1 / 1</span>
          </div>
          ${progress}
          <p class="sg-text" data-sg="text"></p>
          <div class="sg-actions">
            <span class="sg-hint" data-sg="hint" hidden>${escapeHtml(opts.clickHint || "Tap the highlighted area")}</span>
            ${opts.showPoseReplay && opts.engine !== "photo" ? `<button type="button" class="sg-btn sg-btn-ghost" data-sg="pose">${escapeHtml(opts.poseReplayLabel || "Replay pose")}</button>` : ""}
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

  // ─────────────────────────────────────────────────────────────────
  //  MAIN CREATE — engine-agnostic tour controller
  // ─────────────────────────────────────────────────────────────────

  async function create(userOptions) {
    const opts = merge(
      {
        engine: "live2d",
        modelUrl: "",
        photoUrl: "",
        photos: null,
        riveUrl: "",
        riveStateMachine: null,
        lottieUrl: "",
        lottieSegments: null,
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
        onStart: null,
        onStep: null,
        onBeforeStep: null,
        onComplete: null,
        onSkip: null,
        onEnd: null,
      },
      userOptions || {}
    );

    const eng = opts.engine || "live2d";

    // Validate required URL per engine
    if (eng === "live2d" && !opts.modelUrl) throw new Error("ShivamGuide: modelUrl is required for engine:'live2d'");
    if (eng === "photo" && !opts.photoUrl) throw new Error("ShivamGuide: photoUrl is required for engine:'photo'");
    if (eng === "rive" && !opts.riveUrl) throw new Error("ShivamGuide: riveUrl is required for engine:'rive'");
    if (eng === "lottie" && !opts.lottieUrl) throw new Error("ShivamGuide: lottieUrl is required for engine:'lottie'");
    if (!opts.steps?.length) throw new Error("ShivamGuide: steps[] is required");

    const prefersReduced =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;
    const reduceMotion =
      opts.reduceMotion === true ||
      (opts.reduceMotion === "auto" && prefersReduced);

    if (opts.storageKey && global.localStorage?.getItem(opts.storageKey) === "1") {
      return {
        skippedByStorage: true,
        start() {}, next() {}, prev() {}, goTo() {}, replayPose() {},
        end() {}, destroy() {},
        getIndex: () => -1, isActive: () => false,
        motions: [], expressions: [],
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
    let typingDone = true;
    let hopTimer = null;
    let hopCooldownUntil = 0;
    let resizeTimer = null;
    let placeTimer = null;
    let lastCanvasW = 0;
    let lastCanvasH = 0;
    let active = false;
    let destroyed = false;

    // ── Create the adapter ──────────────────────────────────────────

    let adapter;
    switch (eng) {
      case "photo":
        adapter = createPhotoAdapter(opts, canvasWrap, statusEl);
        break;
      case "rive":
        adapter = createRiveAdapter(opts, canvasWrap, statusEl);
        break;
      case "lottie":
        adapter = createLottieAdapter(opts, canvasWrap, statusEl);
        break;
      default:
        adapter = createLive2DAdapter(opts, canvasWrap, statusEl);
        break;
    }

    // ── Tour engine (engine-agnostic) ───────────────────────────────

    function later(ms, fn) {
      return setTimeout(fn, ms);
    }

    function syncCanvasSize(force) {
      const result = adapter.syncCanvasSize(force, lastCanvasW, lastCanvasH);
      if (result.changed) {
        lastCanvasW = result.w;
        lastCanvasH = result.h;
      }
      return result.changed;
    }

    function afterLayout(fn) {
      requestAnimationFrame(() => requestAnimationFrame(fn));
    }

    function isMobile() {
      return window.innerWidth < 640;
    }

    function animateScrollTo(top, onFrame, onDone, maxMs = 520) {
      const scroller = document.scrollingElement || document.documentElement;
      const start = scroller.scrollTop;
      const dist = top - start;
      if (Math.abs(dist) <= 2) {
        onFrame && onFrame();
        onDone && onDone();
        return;
      }
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
        : scroller.scrollTop;
      const minScroll = scroll ? 0 : scroller.scrollTop;
      const cur = scroller.scrollTop;

      const r = el.getBoundingClientRect();
      const blockH = r.height + P * 2;
      const blockDocTop = cur + r.top - P;
      const groupH = blockH + g + sh;

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

      const order = r.top < vh * 0.5 ? ["below", "above"] : ["above", "below"];
      let plan = null;
      for (const s of order) {
        const c = near(s);
        if (c.fits) { plan = c; break; }
      }

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
        stage.style.bottom = "auto";
        stage.style.top = `${Math.round(plan.cardTop)}px`;
      } else {
        stage.style.top = "auto";
        stage.style.bottom = `${Math.round(vh - plan.cardBottom)}px`;
      }

      const willScroll = Math.abs(plan.reqScroll - cur) > 2;
      if (willScroll) spotlight.classList.add("sg-notrans");
      animateScrollTo(
        plan.reqScroll,
        () => { if (willScroll) updateSpotlightRect(el); },
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

    function onPointerMove(e) {
      if (active) adapter.lookAt(e.clientX, e.clientY);
    }

    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (destroyed) return;
        syncCanvasSize();
        if (!active) return;
        const step = opts.steps[stepIndex];
        const el = step?.target ? document.querySelector(step.target) : null;
        if (el) {
          updateSpotlightRect(el);
          if (isMobile()) placeGuideMobile(el, { scroll: false });
          else lookAtTarget(el);
        }
      }, 180);
    }

    function showTag(label) {
      if (!tagEl) return;
      tagEl.textContent = label || "";
      tagEl.style.animation = "none";
      void tagEl.offsetWidth;
      tagEl.style.animation = "";
    }

    function applyPerformance(step) {
      showTag(adapter.poseLabel(step));
      adapter.expression(step.expression);
      adapter.pose(step.pose ?? 0);
      setTimeout(() => adapter.pose(step.pose ?? 0), 90);
      setTimeout(() => adapter.face(step.face), 140);
    }

    function typeLine(text) {
      clearInterval(typeTimer);
      typingDone = false;

      if (reduceMotion || opts.typeSpeedMs <= 0) {
        textEl.textContent = text;
        typingDone = true;
        adapter.lipSync(false);
        return;
      }

      textEl.textContent = "";
      const textNode = document.createTextNode("");
      const caret = document.createElement("span");
      caret.className = "sg-caret";
      textEl.appendChild(textNode);
      textEl.appendChild(caret);

      let i = 0;
      if (opts.lipSync) adapter.lipSync(true, text[0] || " ");

      typeTimer = setInterval(() => {
        textNode.nodeValue = text.slice(0, i);
        if (opts.lipSync && i < text.length) {
          adapter.lipSync(true, text[i] || " ");
        }
        i += 1;
        if (i > text.length) {
          clearInterval(typeTimer);
          typingDone = true;
          adapter.lipSync(false);
          textNode.nodeValue = text;
          if (caret.parentNode) caret.parentNode.removeChild(caret);
        }
      }, Math.max(4, opts.typeSpeedMs || 32));
    }

    function skipTyping(fullText) {
      if (typingDone) return false;
      clearInterval(typeTimer);
      textEl.textContent = fullText;
      typingDone = true;
      adapter.lipSync(false);
      return true;
    }

    function hopGuide(force) {
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
      if (!el) return;
      const r = el.getBoundingClientRect();
      adapter.lookAt(r.left + r.width / 2, r.top + r.height / 2);
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

      let left, top;
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
      if (!step) { end(true); return; }
      adapter.clearGimmicks();
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
      clearInterval(typeTimer);
      textEl.textContent = "";
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
      if (stepIndex >= opts.steps.length - 1) { end(true); return; }
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
      showTag(adapter.poseLabel(step));
      adapter.pose(step.pose ?? 0);
      hopGuide();
      setTimeout(() => adapter.face(step.face), 100);
    }

    function end(completed) {
      if (!active) return;
      active = false;
      clearHighlight();
      adapter.clearGimmicks();
      clearInterval(typeTimer);
      clearTimeout(placeTimer);
      canvasWrap.classList.add("sg-exit");
      document.body.classList.remove("sg-active");
      if (completed && opts.storageKey) {
        try { global.localStorage?.setItem(opts.storageKey, "1"); } catch (_) {}
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
          spotlight.style.visibility = "";
          stage.style.opacity = "";
        });
      });
      opts.onStart?.();
    }

    function destroy() {
      destroyed = true;
      active = false;
      adapter.clearGimmicks();
      clearInterval(typeTimer);
      clearTimeout(resizeTimer);
      clearTimeout(placeTimer);
      clearHighlight();
      document.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("sg-active");
      adapter.destroy();
      root.remove();
    }

    function onKey(e) {
      if (!active || root.hidden) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); next(); }
      if (e.key === "Escape") end(false);
    }

    // Wire up UI events
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
    document.addEventListener("pointermove", onPointerMove);
    window.addEventListener("resize", onResize);

    // ── Initialize the adapter ──────────────────────────────────────

    try {
      await adapter.init();
    } catch (err) {
      adapter.destroy();
      if (opts.keyboard) document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", onResize);

      let hint = "";
      if (eng === "live2d") {
        const isMoc2 = /\.moc[^3]|\.moc"/.test(JSON.stringify(err));
        hint = opts.cubism === 4 && isMoc2
          ? " This looks like a Cubism 2 model (.moc) \u2014 try cubism: 2."
          : opts.cubism === 2 && !isMoc2
          ? " This looks like a Cubism 4 model (.moc3) \u2014 try cubism: 4."
          : "";
      }
      const msg = `Failed to load.${hint}`;
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
        motions: [], expressions: [],
      };
    }

    const catalog = adapter.getCatalog();

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
      get model() { return adapter.model; },
      get motions() { return catalog.motions; },
      get expressions() { return catalog.expressions; },
      get engine() { return eng; },
    };

    if (opts.autoStart) start();
    return api;
  }

  // ─── Public API ───────────────────────────────────────────────────

  const ShivamGuide = { create, ensurePeers, DEFAULT_POSES, PEERS };
  global.ShivamGuide = ShivamGuide;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ShivamGuide;
  }
})(typeof window !== "undefined" ? window : globalThis);
