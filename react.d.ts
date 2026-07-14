import type { ShivamGuideOptions, ShivamGuideTour } from "./shivam-guide";

export interface UseShivamGuideOptions
  extends Omit<ShivamGuideOptions, "mount"> {
  enabled?: boolean;
}

export interface UseShivamGuideResult {
  ready: boolean;
  error: string | null;
  start: () => void;
  end: () => void;
  next: () => void;
  tourRef: { current: ShivamGuideTour | null };
}

export declare function useShivamGuide(
  options: UseShivamGuideOptions
): UseShivamGuideResult;
