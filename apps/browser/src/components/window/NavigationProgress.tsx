import { memo, useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { useTabLive } from "../../state/browser/hooks";
import { useShownPageId } from "../../state/peek/hooks";
import { usePageProgress } from "../../state/tabs/pageProgress";
import { usePageSpans } from "../../state/windows/layout";
import { curve, usePresence } from "../ui/motion";
import { useReducedMotion } from "../ui/reduceMotion";
import { NAVIGATION_PROGRESS as bar } from "./tokens";

const sweepMask = require("../../../assets/navigation-sweep.png");

export function NavigationProgress({ windowId }: { windowId: string }) {
  const tabId = useShownPageId(windowId);
  return tabId ? <TabProgress key={tabId} tabId={tabId} windowId={windowId} /> : null;
}

function TabProgress({ tabId, windowId }: { tabId: string; windowId: string }) {
  const loading = useTabLive(tabId, (live) => live.isLoading);
  const { shown, appear } = usePresence(loading || null, bar.motion);
  return shown ? <LoadPill tabId={tabId} windowId={windowId} loading={loading} opacity={appear} /> : null;
}

function LoadPill({ tabId, windowId, loading, opacity }: { tabId: string; windowId: string; loading: boolean; opacity: Animated.Value }) {
  const progress = usePageProgress(tabId);
  const fraction = loading ? Math.min(1, Math.max(0, progress)) : 1;
  const reduced = useReducedMotion();
  const span = usePageSpans((spans) => spans[windowId]);
  if (!span) return null;

  return (
    <View pointerEvents="none" style={{ position: "absolute", top: bar.top, left: span.left, width: span.width, alignItems: "center" }}>
      <Animated.View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading page"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
        style={{ width: bar.viewportWidth, minWidth: bar.minWidth, maxWidth: bar.maxWidth, height: bar.height, borderRadius: bar.height / 2, overflow: "hidden", backgroundColor: reduced ? bar.sweep : bar.track, opacity }}
      >
        {!reduced && <SandSweep />}
      </Animated.View>
    </View>
  );
}

const SandSweep = memo(function SandSweep() {
  const travel = useRef(new Animated.Value(-bar.maxWidth)).current;
  useEffect(() => {
    travel.setValue(-bar.maxWidth);
    const pass = Animated.loop(Animated.timing(travel, { toValue: 0, duration: bar.sweepPeriod, easing: curve.linear, isInteraction: false, useNativeDriver: true }));
    pass.start();
    return () => pass.stop();
  }, [travel]);
  return (
    <Animated.Image
      accessible={false}
      source={sweepMask}
      resizeMode="stretch"
      style={{ width: 2 * bar.maxWidth, height: bar.height, tintColor: bar.sweep, transform: [{ translateX: travel }] }}
    />
  );
});
