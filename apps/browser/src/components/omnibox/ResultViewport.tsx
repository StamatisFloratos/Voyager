import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Animated, ScrollView } from "react-native";
import { springs } from "../ui/motion";
import { reduceMotion } from "../ui/reduceMotion";
import { SUGGESTION } from "./tokens";

const ROW_PITCH = SUGGESTION.height + 2 * SUGGESTION.gapY;

type Props = { count: number; selected: number; bottom: number; maxHeight?: number; children: ReactNode };

export function ResultViewport({ count, selected, bottom, maxHeight, children }: Props) {
  const content = count ? count * ROW_PITCH + bottom : 0;
  const target = Math.max(0, Math.min(content, maxHeight ?? content));
  const [height] = useState(() => new Animated.Value(target));
  const previous = useRef(target);
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  useLayoutEffect(() => {
    if (target === previous.current) return;
    previous.current = target;
    if (reduceMotion()) height.setValue(target);
    else Animated.spring(height, { toValue: target, ...springs.smooth, overshootClamping: true, restDisplacementThreshold: 0.1, restSpeedThreshold: 0.1, useNativeDriver: false }).start();
  }, [height, target]);
  useEffect(() => () => height.stopAnimation(), [height]);
  useLayoutEffect(() => {
    const row = Math.max(0, selected) * ROW_PITCH;
    const bottomOffset = Math.max(0, row + ROW_PITCH - target);
    const next = Math.min(content - target, row, Math.max(offset.current, bottomOffset));
    if (next === offset.current) return;
    offset.current = next;
    scroll.current?.scrollTo({ y: next, animated: false });
  }, [content, target, selected]);
  return (
    <Animated.View style={{ height, overflow: "hidden" }}>
      <ScrollView
        ref={scroll}
        scrollEnabled={target < content}
        keyboardShouldPersistTaps="always"
        scrollEventThrottle={16}
        onScroll={(e) => (offset.current = e.nativeEvent.contentOffset.y)}
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
}
