import { useEffect, useRef, useCallback, useState } from "react";

/** Side-effect: registers window.ShivamGuide (peers load lazily on create). */
import "./shivam-guide.js";
import "./shivam-guide.css";

const DEFAULT_MODEL =
  "https://cdn.jsdelivr.net/gh/evrstr/live2d-widget-models/live2d_evrstr/natori/model.json";

/**
 * Start ShivamGuide after React mounts; destroy on unmount / route change.
 * Cubism + Pixi are loaded automatically inside ShivamGuide.create() — no <Script> tags needed.
 */
export function useShivamGuide(options) {
  const {
    steps,
    modelUrl = DEFAULT_MODEL,
    speaker = "Guide",
    autoStart = true,
    storageKey,
    enabled = true,
    loadPeers = true,
    onComplete,
    onStep,
    onBeforeStep,
    onSkip,
    onEnd,
    onStart,
    // Everything else (theme, typeSpeedMs, showProgress, advanceOnClick,
    // spotlightPadding, labels, scales, poses, …) is forwarded verbatim.
    ...rest
  } = options;

  const tourRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const cbRef = useRef({});
  cbRef.current = { onComplete, onStep, onBeforeStep, onSkip, onEnd, onStart };

  const stepsKey = JSON.stringify(steps);
  // Serialize plain-data options so the tour rebuilds when they change.
  const restKey = JSON.stringify(rest);

  useEffect(() => {
    if (!enabled || !steps?.length) return undefined;
    if (typeof window === "undefined") return undefined;

    let cancelled = false;

    async function boot() {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (cancelled) return;

      if (!window.ShivamGuide) {
        setError("ShivamGuide failed to register — check package import");
        return;
      }

      try {
        const tour = await window.ShivamGuide.create({
          ...rest,
          modelUrl,
          speaker,
          steps,
          autoStart,
          storageKey,
          loadPeers,
          onStart: (...a) => cbRef.current.onStart?.(...a),
          onComplete: (...a) => cbRef.current.onComplete?.(...a),
          onStep: (...a) => cbRef.current.onStep?.(...a),
          onBeforeStep: (...a) => cbRef.current.onBeforeStep?.(...a),
          onSkip: (...a) => cbRef.current.onSkip?.(...a),
          onEnd: (...a) => cbRef.current.onEnd?.(...a),
        });

        if (cancelled) {
          tour.destroy();
          return;
        }

        tourRef.current = tour;
        setReady(true);
        setError(null);
      } catch (err) {
        console.error(err);
        setError(err?.message || String(err));
      }
    }

    boot();

    return () => {
      cancelled = true;
      tourRef.current?.destroy();
      tourRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, modelUrl, speaker, autoStart, storageKey, loadPeers, stepsKey, restKey]);

  const start = useCallback(() => tourRef.current?.start(), []);
  const end = useCallback(() => tourRef.current?.end(), []);
  const next = useCallback(() => tourRef.current?.next(), []);

  return { ready, error, start, end, next, tourRef };
}
