/**
 * ShivamGuide — TypeScript definitions
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

export interface ShivamGuideStep {
  /** CSS selector for spotlight, or omit / null for no highlight */
  target?: string | null;
  /** Dialogue line */
  line: string;
  nextLabel?: string;
  /** Motion index (body pose) */
  pose?: number;
  /** Label override for the POSE · tag */
  poseName?: string;
  /** Expression pack index */
  expression?: number;
  /** Built-in face accent */
  face?: ShivamGuideFace;
  /** Advance when the highlighted target is tapped (overrides advanceOnClick) */
  waitForClick?: boolean;
  id?: string;
}

/** Colors / fonts — any CSS color or gradient string. */
export interface ShivamGuideTheme {
  accent?: string;
  ring?: string;
  dim?: string;
  /** Speaker label + progress bar color */
  speaker?: string;
  speakerColor?: string;
  font?: string;
  /** Dialogue card background (color or gradient) */
  dialogueBg?: string;
  /** Dialogue text color */
  textColor?: string;
  /** Primary button background (color or gradient) */
  primary?: string;
  primaryText?: string;
  /** Spotlight corner radius, e.g. "14px" */
  radius?: string;
}

export interface ShivamGuideOptions {
  modelUrl: string;
  speaker?: string;
  steps: ShivamGuideStep[];
  poses?: ShivamGuidePose[];
  autoStart?: boolean;
  showPoseReplay?: boolean;
  showSkip?: boolean;
  /** Show a step progress bar in the dialogue card (default false) */
  showProgress?: boolean;
  lipSync?: boolean;
  /** Cubism SDK version: 2 for .moc models, 4 for .moc3 models (default 4) */
  cubism?: 2 | 4;
  /** Auto-inject Cubism/Pixi CDN scripts (default true) */
  loadPeers?: boolean;
  mount?: HTMLElement | null;
  storageKey?: string | null;
  zIndex?: number;

  // --- Customization ---
  /** Color / font overrides applied as CSS variables on the root */
  theme?: ShivamGuideTheme | null;
  /** Typewriter speed in ms per character (default 32; 0 = instant) */
  typeSpeedMs?: number;
  /** Spotlight padding around the target in px (default 12) */
  spotlightPadding?: number;
  /** Spotlight corner radius in px */
  spotlightRadius?: number | null;
  /** Enable arrow/enter/escape keyboard controls (default true) */
  keyboard?: boolean;
  /** Let users advance by tapping the highlighted target (default false) */
  advanceOnClick?: boolean;
  /** Hint text shown when a step waits for a click */
  clickHint?: string;
  /** "auto" (respect OS), true (always reduce), or false (never) */
  reduceMotion?: "auto" | boolean;
  /** Multiplier for the character size on phones (default 1) */
  mobileScale?: number;
  /** Multiplier for the character size on desktop (default 1) */
  desktopScale?: number;
  /** Button label overrides */
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
  /** Fires after complete OR skip; arg is true when completed */
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
}

export interface ShivamGuideStatic {
  create(options: ShivamGuideOptions): Promise<ShivamGuideTour>;
  ensurePeers(): Promise<void>;
  DEFAULT_POSES: ShivamGuidePose[];
}

declare global {
  interface Window {
    ShivamGuide: ShivamGuideStatic;
    PIXI?: {
      live2d?: unknown;
      Application?: unknown;
    };
  }
}

declare const ShivamGuide: ShivamGuideStatic;
export default ShivamGuide;
