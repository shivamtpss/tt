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
  } = options;

  const tourRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const onCompleteRef = useRef(onComplete);
  const onStepRef = useRef(onStep);
  const onBeforeStepRef = useRef(onBeforeStep);
  onCompleteRef.current = onComplete;
  onStepRef.current = onStep;
  onBeforeStepRef.current = onBeforeStep;

  const stepsKey = JSON.stringify(steps);

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
          modelUrl,
          speaker,
          steps,
          autoStart,
          storageKey,
          loadPeers,
          onComplete: (...a) => onCompleteRef.current?.(...a),
          onStep: (...a) => onStepRef.current?.(...a),
          onBeforeStep: (...a) => onBeforeStepRef.current?.(...a),
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
  }, [enabled, modelUrl, speaker, autoStart, storageKey, loadPeers, stepsKey]);

  const start = useCallback(() => tourRef.current?.start(), []);
  const end = useCallback(() => tourRef.current?.end(), []);
  const next = useCallback(() => tourRef.current?.next(), []);

  return { ready, error, start, end, next, tourRef };
}
