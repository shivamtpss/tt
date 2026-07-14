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
  id?: string;
}

export interface ShivamGuideOptions {
  modelUrl: string;
  speaker?: string;
  steps: ShivamGuideStep[];
  poses?: ShivamGuidePose[];
  autoStart?: boolean;
  showPoseReplay?: boolean;
  showSkip?: boolean;
  lipSync?: boolean;
  /** Auto-inject Cubism/Pixi CDN scripts (default true) */
  loadPeers?: boolean;
  mount?: HTMLElement | null;
  storageKey?: string | null;
  zIndex?: number;
  onStart?: () => void;
  onStep?: (step: ShivamGuideStep, index: number) => void;
  onBeforeStep?: (step: ShivamGuideStep, index: number) => void;
  onComplete?: () => void;
  onSkip?: () => void;
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
