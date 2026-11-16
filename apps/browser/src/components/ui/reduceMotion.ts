import { useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";

let reduce: boolean | null = null;

export const reduceMotionKnown: Promise<boolean> = AccessibilityInfo.isReduceMotionEnabled().then(
  (on) => (reduce = on),
  () => (reduce = false),
);
AccessibilityInfo.addEventListener("reduceMotionChanged", (on) => (reduce = on));

export const reduceMotion = () => reduce;

function watchReducedMotion(update: () => void) {
  let active = true;
  void reduceMotionKnown.then(() => active && update());
  const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", update);
  return () => {
    active = false;
    subscription.remove();
  };
}

export const useReducedMotion = () => useSyncExternalStore(watchReducedMotion, reduceMotion) !== false;
