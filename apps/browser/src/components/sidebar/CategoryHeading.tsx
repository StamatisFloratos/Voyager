import type { ReactNode } from "react";
import { Animated, View } from "react-native";
import { space, Symbol, Text } from "../ui";
import { layout, useTheme } from "../ui/theme";
import { TAB_ROW } from "./tokens";

export const CATEGORY_ROW = { height: layout.rowHeight, flexDirection: "row", alignItems: "center", paddingHorizontal: TAB_ROW.contentLeft, gap: space.s } as const;
const CHEVRON = { width: 10, height: 10 } as const;

export function CategoryHeading({ label, open, tint, dropTarget, children }: { label: string; open: Animated.Value | boolean; tint: string | null; dropTarget?: boolean; children?: ReactNode }) {
  const theme = useTheme();
  const rotate = typeof open === "boolean" ? (open ? "180deg" : "0deg") : open.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  return (
    <View style={CATEGORY_ROW}>
      <Text size="small" weight="semibold" tone={dropTarget ? "textPrimary" : "textSecondary"} lines={1} ellipsizeMode="tail" style={{ flexShrink: 1 }}>{label}</Text>
      {children}
      <Animated.View style={{ marginLeft: "auto", transform: [{ rotate }] }}>
        <Symbol name="chevron.down" size={9} weight="semibold" color={tint ?? theme.icon} style={CHEVRON} />
      </Animated.View>
    </View>
  );
}
