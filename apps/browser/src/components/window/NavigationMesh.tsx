import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet } from "react-native";
import { fieldTiming } from "../../state/telemetry/fieldTiming";
import { usePage, type DocumentMesh } from "../../state/tabs/pageState";
import { curve } from "../ui/motion";
import { meshColors } from "./meshColors";
import { NAVIGATION_MESH as motion } from "./tokens";

const softSpot = require("../../../assets/page-mesh-mask.png");

const fields = [
  { left: "-31%", top: "-54%", phase: 0.11 },
  { left: "32%", top: "-45%", phase: 0.48 },
  { left: "-12%", top: "-7%", phase: 0.77 },
  { left: "51%", top: "-9%", phase: 0.24 },
  { left: "-35%", top: "40%", phase: 0.58 },
  { left: "23%", top: "44%", phase: 0.92 },
] as const;
const steps = Array.from({ length: 13 }, (_, index) => index / 12);

function meshTransforms(time: Animated.Value) {
  return fields.map(({ phase }) => {
    const orbit = (amplitude: number, offset: number, center = 0) => time.interpolate({
      inputRange: steps,
      outputRange: steps.map((t) => center + amplitude * Math.sin(2 * Math.PI * (t + phase + offset))),
    });
    return [{ translateX: orbit(54, 0) }, { translateY: orbit(36, 0.25) }, { scaleX: orbit(0.16, 0.3, 1) }];
  });
}

type Palette = ReturnType<typeof meshColors> & { key: string };

const MeshLayer = memo(function MeshLayer({ palette, transforms, onShown }: {
  palette: Palette;
  transforms: ReturnType<typeof meshTransforms>;
  onShown: (palette: Palette) => void;
}) {
  const [strength] = useState(() => new Animated.Value(0));
  useLayoutEffect(() => {
    const enter = Animated.timing(strength, {
      toValue: 1, duration: motion.enter, easing: curve.pulse, isInteraction: false, useNativeDriver: true,
    });
    enter.start(({ finished }) => { if (finished) onShown(palette); });
    return () => enter.stop();
  }, [strength, palette, onShown]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: palette.base, opacity: strength }]}>
      {fields.map(({ left, top }, index) => (
        <Animated.Image
          key={index} source={softSpot} accessible={false} resizeMode="stretch"
          style={{ position: "absolute", left, top, width: "95%", height: "106%", tintColor: palette.fields[index], transform: transforms[index] }}
        />
      ))}
    </Animated.View>
  );
});

export function NavigationMesh({ tabId }: { tabId: string }) {
  const mesh = usePage(tabId, (page) => page.documentMesh);
  const retained = useRef(mesh);
  const [removed, setRemoved] = useState<number | null>(null);
  if (mesh) retained.current = mesh;
  const frame = mesh ?? retained.current;
  if (!frame || (!mesh && frame.id === removed)) return null;
  return <PageMesh key={frame.id} tabId={tabId} frame={frame} reveal={!mesh} onGone={setRemoved} />;
}

function PageMesh({ tabId, frame, reveal, onGone }: {
  tabId: string;
  frame: DocumentMesh;
  reveal: boolean;
  onGone: (id: number) => void;
}) {
  const [opacity] = useState(() => new Animated.Value(1));
  const [time] = useState(() => new Animated.Value(0));
  const mountedAt = useRef(0);
  const transforms = useMemo(() => meshTransforms(time), [time]);
  const palette = useMemo(() => {
    const colors = meshColors(frame.background, frame.colors);
    return { ...colors, key: colors.base + colors.fields.join("") };
  }, [frame.background, frame.colors]);
  const [background] = useState(palette.base);
  const [shown, setShown] = useState<Palette | null>(null);
  const [incoming, setIncoming] = useState(palette);
  if (shown === incoming && palette.key !== incoming.key) setIncoming(palette);
  const layers = shown && shown !== incoming ? [shown, incoming] : [incoming];

  useLayoutEffect(() => {
    mountedAt.current = performance.now();
    fieldTiming?.markFrame(tabId, "meshShown");
    return () => fieldTiming?.markFrame(tabId, "meshGone");
  }, [tabId]);

  useEffect(() => {
    const animation = Animated.loop(Animated.timing(time, {
      toValue: 1, duration: motion.cycle, easing: curve.linear, isInteraction: false, useNativeDriver: true,
    }));
    animation.start();
    return () => animation.stop();
  }, [time]);

  useLayoutEffect(() => {
    if (!reveal) return;
    const animation = Animated.timing(opacity, {
      toValue: 0, duration: motion.reveal, delay: Math.max(0, mountedAt.current + motion.minimum - performance.now()),
      easing: curve.pulse, isInteraction: false, useNativeDriver: true,
    });
    animation.start(({ finished }) => { if (finished) onGone(frame.id); });
    return () => animation.stop();
  }, [reveal, frame.id, opacity, onGone]);

  return (
    <Animated.View
      nativeID="voyager.navigationMesh" pointerEvents="none" accessible={false} accessibilityElementsHidden
      style={[StyleSheet.absoluteFill, { overflow: "hidden", backgroundColor: background, opacity }]}
    >
      {layers.map(layer => <MeshLayer key={layer.key} palette={layer} transforms={transforms} onShown={setShown} />)}
    </Animated.View>
  );
}
