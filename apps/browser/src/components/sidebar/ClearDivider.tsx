import { memo, useEffect, useState } from "react";
import { Animated, Image, Pressable, View } from "react-native";
import { useTheme } from "../ui/theme";
import { ContextMenuArea, space, Symbol, Text, useHover } from "../ui";
import { TAB_ROW } from "./tokens";
import { HoverSlot } from "../ui/HoverSlot";
import { curve, duration } from "../ui/motion";
import { reduceMotion } from "../ui/reduceMotion";
import { openSidebarMenu } from "../../state/sidebar/menus";
import { PINNED_FOLD_TITLES, togglePinnedFold } from "../../state/sidebar/pinnedFold";

const CLEAR_DIVIDER_HEIGHT = space.xxxl;
const WAVE_LENGTH = 14;
const WAVE_TILE_WIDTH = 12 * WAVE_LENGTH;
const WAVE_HEIGHT = 9;
const WAVE_DURATION = 520;
const waveMask = require("../../../assets/tidy-wave.png");

type PinnedFold = { collapsed: boolean; open: Animated.Value };

type DividerProps = { windowId: string; profileId: string; lift: number; showClear: boolean; canClear: boolean; canTidy: boolean; onAction: (action: "tidy" | "clear") => void; pinned: PinnedFold | null };

export const ClearDivider = memo(function ClearDivider({ windowId, profileId, lift, showClear, canClear, canTidy, onAction, pinned }: DividerProps) {
  const { hovered: shown, hoverProps } = useHover();
  const [sweep] = useState(() => new Animated.Value(0));
  const [wave] = useState(() => new Animated.Value(0));
  useEffect(() => () => {
    wave.stopAnimation();
    sweep.stopAnimation();
  }, [wave, sweep]);
  function activate(action: "tidy" | "clear") {
    if (action === "tidy" ? !canTidy : !canClear) return;
    wave.setValue(0);
    sweep.setValue(0);
    if (!reduceMotion()) {
      if (action === "tidy") {
        Animated.timing(wave, { toValue: 1, duration: WAVE_DURATION, easing: curve.move, useNativeDriver: true }).start();
      } else {
        sweep.setValue(1);
        Animated.timing(sweep, { toValue: 0, duration: duration.long, easing: curve.move, useNativeDriver: true }).start();
      }
    }
    onAction(action);
  }
  const foldShown = !!pinned && (shown || pinned.collapsed);
  return (
    <ContextMenuArea onContextMenu={() => void openSidebarMenu(windowId)}>
      <View
        {...hoverProps}
        style={{
          height: CLEAR_DIVIDER_HEIGHT,
          marginTop: -lift,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: TAB_ROW.contentLeft,
        }}
      >
        {pinned ? <HoverSlot hovered={foldShown} width="content" reserve="hover" align="start" hover={<FoldButton pinned={pinned} onPress={() => togglePinnedFold(profileId)} />} /> : null}
        <DividerLine wave={wave} sweep={sweep} />
        <DividerButton title="Tidy" enabled={canTidy} label="Tidy related tabs" onPress={() => activate("tidy")} />
        {showClear ? <DividerButton title="Clear" enabled={canClear} label="Clear unpinned tabs" onPress={() => activate("clear")} /> : null}
      </View>
    </ContextMenuArea>
  );
});

const DividerLine = memo(function DividerLine({ wave, sweep }: { wave: Animated.Value; sweep: Animated.Value }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const streak = width * 0.34;
  const travel = 2 * WAVE_LENGTH;
  const tiles = Math.ceil((width + travel) / WAVE_TILE_WIDTH);
  const phase = wave.interpolate({ inputRange: [0, 1], outputRange: [0, -travel] });
  const envelope = [0, 0.22, 0.72, 1];
  const scaleY = wave.interpolate({ inputRange: envelope, outputRange: [0.15, 1, 1, 0.15] });
  const waveOpacity = wave.interpolate({ inputRange: envelope, outputRange: [0, 0.36, 0.36, 0] });
  const ruleOpacity = wave.interpolate({ inputRange: envelope, outputRange: [1, 0, 0, 1] });
  const streakX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-streak, width] });
  const opacity = sweep.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0] });
  return (
    <View pointerEvents="none" aria-hidden onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ flex: 1, height: WAVE_HEIGHT, overflow: "hidden", justifyContent: "center" }}>
      {width > 0 ? (
        <>
          <Animated.View style={{ position: "absolute", width, height: 1, backgroundColor: theme.divider, opacity: ruleOpacity }} />
          <Animated.View style={{ position: "absolute", width: tiles * WAVE_TILE_WIDTH, flexDirection: "row", opacity: waveOpacity, transform: [{ translateX: phase }, { scaleY }] }}>
            {Array.from({ length: tiles }, (_, index) => (
              <Image key={index} accessible={false} source={waveMask} resizeMode="stretch" style={{ width: WAVE_TILE_WIDTH, height: WAVE_HEIGHT, tintColor: theme.textSecondary }} />
            ))}
          </Animated.View>
          <Animated.View style={{ width: streak, height: 1, opacity, backgroundColor: theme.textSecondary, transform: [{ translateX: streakX }] }} />
        </>
      ) : null}
    </View>
  );
});

function FoldButton({ pinned, onPress }: { pinned: PinnedFold; onPress: () => void }) {
  const theme = useTheme();
  const { hovered, hoverProps } = useHover();
  const label = pinned.collapsed ? PINNED_FOLD_TITLES.expand : PINNED_FOLD_TITLES.collapse;
  const rotate = pinned.open.interpolate({ inputRange: [0, 1], outputRange: ["-90deg", "0deg"] });
  return (
    <View {...hoverProps}>
      <Pressable tooltip={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: !pinned.collapsed }} onAccessibilityTap={onPress} onPress={onPress}>
        {({ pressed }) => {
          const color = pressed ? theme.textSecondary : hovered ? theme.textPrimary : theme.textTertiary;
          return (
            <View style={{ height: CLEAR_DIVIDER_HEIGHT, flexDirection: "row", alignItems: "center", paddingRight: space.m }}>
              <Animated.View style={{ width: 10, height: 10, marginRight: space.xs, alignItems: "center", justifyContent: "center", transform: [{ rotate }] }}>
                <Symbol name="chevron.down" size={8} weight="semibold" color={color} style={{ width: 10, height: 10 }} />
              </Animated.View>
              <Text size="tiny" weight="medium" color={color}>
                Pinned
              </Text>
            </View>
          );
        }}
      </Pressable>
    </View>
  );
}

function DividerButton({ title, enabled, label, onPress }: { title: "Tidy" | "Clear"; enabled: boolean; label: string; onPress: () => void }) {
  const theme = useTheme();
  const { hovered, hoverProps } = useHover();
  return (
    <View {...hoverProps}>
      <Pressable
        tooltip={label}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !enabled }}
        disabled={!enabled}
        focusable={enabled}
        onAccessibilityTap={enabled ? onPress : undefined}
        onPress={onPress}
      >
        {({ pressed }) => {
          const color = !enabled ? theme.textTertiary : pressed ? theme.textSecondary : hovered || title === "Tidy" ? theme.textPrimary : theme.textSecondary;
          return (
            <View style={{ height: CLEAR_DIVIDER_HEIGHT, flexDirection: "row", alignItems: "center", paddingLeft: space.m, paddingRight: space.xs }}>
              {title === "Tidy" ? <Symbol name="paintbrush" size={10} weight="semibold" color={color} style={{ width: 11, height: 12, marginRight: space.xs }} /> : null}
              <Text size="caption" weight="semibold" color={color}>
                {title}
              </Text>
            </View>
          );
        }}
      </Pressable>
    </View>
  );
}
