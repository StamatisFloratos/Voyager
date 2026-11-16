import { Animated } from "react-native";
import { useTheme } from "../ui/theme";
import { ghostEntry } from "./GhostEntry";
import { GROUP_INDENT } from "./geometry";
import type { ListActionTransition } from "./listActionMotion";

export function ListActionGhosts({ run, top }: { run: ListActionTransition; top: number }) {
  const theme = useTheme();
  return (
    <>
      {run.ghosts.map(({ snapshot, top: y, depth, drift }) => (
        <Animated.View
          key={snapshot.key}
          pointerEvents="none"
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: "absolute", top: top + y, left: Math.max(0, depth - 1) * GROUP_INDENT, right: 0, opacity: run.opacity, transform: [{ translateY: drift }] }}
        >
          {ghostEntry(snapshot, theme, 0)}
        </Animated.View>
      ))}
    </>
  );
}
