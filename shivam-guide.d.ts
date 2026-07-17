/**
 * ShivamGuide — TypeScript definitions (engine-agnostic)
 * Runtime attaches to window.ShivamGuide via the IIFE script.
 */

export interface ShivamGuidePose {
  id: number;
  name: string;
}

export type ShivamGuideFace =
  | "smile"
  | "look"
  | "sparkle"
  | "wink"
  | "think"
  | "hype"
  | "bye"
  | string
  | false
  | null;

export type ShivamGuideEngine = "live2d" | "photo" | "rive" | "lottie";

export interface ShivamGuideMotionEntry {
  group: string;
  index: number;
  name: string;
  file: string;
}

export interface ShivamGuideExpressionEntry {
  index: number;
  name: string;
  file: string;
}

export interface ShivamGuideStep {
  target?: string | null;
  line: string;
  nextLabel?: string;
  pose?: number | string | { group: string; index: number };
  poseName?: string;
  expression?: number | string;
  face?: ShivamGuideFace;
  waitForClick?: boolean;
  id?: string;
}

export interface ShivamGuideTheme {
  accent?: string;
  ring?: string;
  dim?: string;
  speaker?: string;
  speakerColor?: string;
  font?: string;
  dialogueBg?: string;
  textColor?: string;
  primary?: string;
  primaryText?: string;
  radius?: string;
}

export interface ShivamGuideOptions {
  /** Character engine (default "live2d") */
  engine?: ShivamGuideEngine;

  // --- Live2D engine ---
  /** Live2D model.json URL (required for engine:"live2d") */
  modelUrl?: string;
  /** Cubism SDK version: 2 for .moc, 4 for .moc3 (default 4) */
  cubism?: 2 | 4;
  /** Auto-inject Cubism/Pixi CDN scripts (default true) */
  loadPeers?: boolean;

  // --- Photo engine ---
  /** Main photo URL (required for engine:"photo") */
  photoUrl?: string;
  /** Map of expression name to image URL, e.g. { smile: "/me-smile.png" } */
  photos?: Record<string, string> | null;

  // --- Rive engine ---
  /** .riv file URL (required for engine:"rive") */
  riveUrl?: string;
  /** State machine name(s) to auto-play */
  riveStateMachine?: string | string[] | null;

  // --- Lottie engine ---
  /** Lottie JSON URL (required for engine:"lottie") */
  lottieUrl?: string;
  /** Named segments: { idle: [120, 240], wave: [0, 30] } or { idle: { start: 120, end: 240 } } */
  lottieSegments?: Record<string, { start: number; end: number } | [number, number]> | null;
  /** Frame number where the idle loop starts. The intro (frame 0 → lottieIdleFrom) plays once, then only the idle portion loops. */
  lottieIdleFrom?: number | null;

  // --- Common ---
  speaker?: string;
  steps: ShivamGuideStep[];
  poses?: ShivamGuidePose[];
  autoStart?: boolean;
  showPoseReplay?: boolean;
  showSkip?: boolean;
  showProgress?: boolean;
  lipSync?: boolean;
  mount?: HTMLElement | null;
  storageKey?: string | null;
  zIndex?: number;

  // --- Customization ---
  theme?: ShivamGuideTheme | null;
  typeSpeedMs?: number;
  spotlightPadding?: number;
  spotlightRadius?: number | null;
  keyboard?: boolean;
  advanceOnClick?: boolean;
  clickHint?: string;
  reduceMotion?: "auto" | boolean;
  mobileScale?: number;
  desktopScale?: number;
  modelAnchorY?: number;
  mobileAnchorY?: number;
  mobileModelScale?: number;
  debug?: boolean;
  skipLabel?: string;
  doneLabel?: string;
  nextLabel?: string | null;
  poseReplayLabel?: string;

  // --- Callbacks ---
  onStart?: () => void;
  onStep?: (step: ShivamGuideStep, index: number) => void;
  onBeforeStep?: (step: ShivamGuideStep, index: number) => void;
  onComplete?: () => void;
  onSkip?: () => void;
  onEnd?: (completed: boolean) => void;
}

export interface ShivamGuideTour {
  skippedByStorage?: boolean;
  start(): void;
  next(): void;
  prev(): void;
  goTo(index: number): void;
  replayPose(): void;
  end(): void;
  destroy(): void;
  getIndex(): number;
  isActive(): boolean;
  readonly root?: HTMLElement;
  readonly model?: unknown;
  readonly motions: ShivamGuideMotionEntry[];
  readonly expressions: ShivamGuideExpressionEntry[];
  readonly engine: ShivamGuideEngine;
}

export interface ShivamGuideStatic {
  create(options: ShivamGuideOptions): Promise<ShivamGuideTour>;
  ensurePeers(ver?: 2 | 4): Promise<void>;
  DEFAULT_POSES: ShivamGuidePose[];
}

declare global {
  interface Window {
    ShivamGuide: ShivamGuideStatic;
    PIXI?: { live2d?: unknown; Application?: unknown };
    rive?: unknown;
    lottie?: unknown;
  }
}

declare const ShivamGuide: ShivamGuideStatic;
export default ShivamGuide;
