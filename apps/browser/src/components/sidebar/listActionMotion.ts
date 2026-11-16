import { createContext, useCallback, useLayoutEffect, useState } from "react";
import { Animated } from "react-native";
import { workspaceSnapshot } from "../../state/browser/current";
import { listActionLayout } from "../../state/sidebar/listActionLayout";
import { closeAllTabs } from "../../state/sidebar/clearTabs";
import { tidyTabs } from "../../state/sidebar/tidyTabs";
import { curve, duration } from "../ui/motion";
import { reduceMotion } from "../ui/reduceMotion";
import type { EntryMotion } from "./EntryMotion";
import { snapshotEntry } from "./GhostEntry";

const STILL: ReadonlyMap<string, EntryMotion> = new Map();
export const ListActionMotionContext = createContext(STILL);

function transition(before: ReturnType<typeof workspaceSnapshot>, after: ReturnType<typeof workspaceSnapshot>, windowId: string, profileId: string) {
  const offsets = listActionLayout(before, after, windowId, profileId);
  const progress = new Animated.Value(0);
  const from = (delta: number) => progress.interpolate({ inputRange: [0, 1], outputRange: [delta, 0] });
  const rows = new Map<string, EntryMotion>();
  for (const [entry, delta] of offsets.rows) rows.set(entry, { shift: from(delta) });
  const ghosts = offsets.departures.flatMap(({ key, top, depth, wholeGroup, destination }) => {
    const shot = snapshotEntry(before, windowId, profileId, key);
    if (!shot) return [];
    const snapshot = shot.kind === "group" && !wholeGroup ? { ...shot, members: [] } : shot;
    return [{ snapshot, top, depth, drift: progress.interpolate({ inputRange: [0, 1], outputRange: [0, destination === undefined ? -6 : destination - top] }) }];
  });
  const opacity = progress.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 0, 0] });
  return { progress, rows, ghosts, opacity, tail: offsets.tail ? from(offsets.tail) : null };
}

export type ListActionTransition = ReturnType<typeof transition>;

export function useListActionMotion(windowId: string, profileId: string) {
  const [run, setRun] = useState<ReturnType<typeof transition> | null>(null);
  const activate = useCallback((action: "tidy" | "clear") => {
    const before = workspaceSnapshot();
    if (before.windows[windowId]?.profileId !== profileId) return;
    if (action === "tidy") tidyTabs(windowId, profileId);
    else closeAllTabs(windowId);
    const after = workspaceSnapshot();
    if (before !== after) setRun(reduceMotion() ? null : transition(before, after, windowId, profileId));
  }, [windowId, profileId]);
  useLayoutEffect(() => {
    if (!run) return;
    const animation = Animated.timing(run.progress, { toValue: 1, duration: duration.slow, easing: curve.enter, useNativeDriver: true });
    animation.start(({ finished }) => {
      if (finished) setRun((current) => current === run ? null : current);
    });
    return () => animation.stop();
  }, [run]);
  return { activate, run, rows: run?.rows ?? STILL, tail: run?.tail ?? null };
}
