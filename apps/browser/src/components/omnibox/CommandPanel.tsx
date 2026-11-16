import { OutsidePressArea, reduceMotion, Surface, VisualEffect } from "../ui";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { hex, ThemeContext, useTheme, type Theme } from "../ui/theme";
import { useSidebarSide, useWindowId, useWindowUi } from "../../state/browser/hooks";
import { closePanel } from "../../state/windows/actions";
import { useActiveTabIdWhile } from "../../state/omnibox/hooks";
import { isCentred } from "../../state/omnibox/barPlacement";
import { usePage } from "../../state/tabs/pageState";
import { dismissHover, setRowsCovered } from "../../state/sidebar/hover";
import { useCardAnchors, useUrlAnchors } from "../../state/windows/layout";
import { barWidth } from "../ntp/NewTabPage";
import { closeNewTabBar, dismissNewTabSearchOnPress } from "../../state/omnibox/newTabBar";
import type { NewTabTarget } from "../../state/browser/types";
import { Omnibox } from "./Omnibox";
import { BAR, PANEL_TEXT_LEFT, GROW } from "./tokens";
import { closePanelToHeroBar, type BarDismissal } from "../../state/omnibox/barState";
import { insecureLevel, urlTextLeft } from "../toolbar/Toolbar";
import { useToolbarRow } from "../toolbar/useToolbarRow";
import { compactLift } from "../../lib/toolbarRow";
import { radius, shadow, space, withAlpha } from "../ui/tokens";
import { sandDunes } from "../ui/themes/tokens";

const RIGHT_OF_URL = 40;
const ABOVE_PANE = 5.5;
const PANEL_RADIUS = radius.hero;
const MIN_WIDTH = 420;
const WINDOW_MARGIN = space.l;
const DROPDOWN_MIN_WIDTH = 350;
const DROPDOWN_PAST_FIELD = 137;
const DROPDOWN_RADIUS = radius.panel;
const CENTRED_TOP_SHARE = 0.38;

type Box = { left: number; top: number; width: number; height: number };

export function CommandPanel({ windowWidth }: { windowWidth: number }) {
  const theme = useTheme();
  const windowId = useWindowId();
  const { panel } = useWindowUi();
  const activeId = useActiveTabIdWhile(windowId, panel.open);
  const insecure = usePage(activeId, (p) => !!insecureLevel(p));
  const anchor = useUrlAnchors((s) => (panel.open ? s[windowId] : undefined));
  const centred = panel.open && !panel.newTab && isCentred(panel.placement);
  const card = useCardAnchors((s) => (panel.newTab || centred ? s[windowId] : undefined));
  const toolbarRow = useToolbarRow();
  const sidebarRight = useSidebarSide(windowId) === "right";
  const overRows = panel.open && !panel.newTab && !centred && !!anchor?.sidebar;
  useEffect(() => {
    if (panel.open) dismissHover();
    setRowsCovered(windowId, overRows);
  }, [panel.open, overRows, windowId]);
  if (!panel.open || !activeId) return null;
  if (panel.newTab || centred) {
    return card ? <CentredBar windowId={windowId} tabId={activeId} target={panel.newTab} initialText={panel.initialText} card={card} /> : null;
  }

  const room = (left: number, fallback: number) => (windowWidth > 0 ? windowWidth - left - WINDOW_MARGIN : fallback);
  const onCancel = () => closePanel(windowId);
  const onDone = (reason?: BarDismissal) => closePanelToHeroBar(windowId, activeId, reason);
  if (!anchor) return null;

  if (anchor.sidebar) {
    const shown = anchor.left >= 0 && (!sidebarRight || windowWidth <= 0 || anchor.left < windowWidth);
    const wanted = Math.max(DROPDOWN_MIN_WIDTH, anchor.width + DROPDOWN_PAST_FIELD);
    const end = shown ? anchor.left + anchor.width : windowWidth - WINDOW_MARGIN;
    const left = sidebarRight ? Math.max(WINDOW_MARGIN, end - wanted) : shown ? anchor.left : WINDOW_MARGIN;
    const width = sidebarRight ? end - left : Math.min(wanted, room(left, DROPDOWN_MIN_WIDTH));
    return (
      <Grow frame={{ left, top: anchor.top, width }} radius={DROPDOWN_RADIUS} surface={<PanelSurface theme={theme} radius={DROPDOWN_RADIUS} />}>
        <OutsidePressArea onOutsidePress={onCancel}>
          <Omnibox key={activeId} variant="sidebar" tabId={activeId} initialText={panel.initialText} onCancel={onCancel} onDone={onDone} />
        </OutsidePressArea>
      </Grow>
    );
  }

  const left = Math.max(WINDOW_MARGIN, anchor.left + urlTextLeft(insecure) - PANEL_TEXT_LEFT);
  const top = Math.max(0.5, anchor.top - ABOVE_PANE);
  const covering = anchor.left + anchor.width + RIGHT_OF_URL - left;
  const width = Math.min(Math.max(covering, MIN_WIDTH), room(left, covering));
  const lift = compactLift(toolbarRow);
  return (
    <Grow frame={{ left, top, width }} radius={PANEL_RADIUS} surface={<PanelSurface theme={theme} radius={PANEL_RADIUS} />}>
      <OutsidePressArea onOutsidePress={onCancel}>
        <Omnibox key={activeId} variant="panel" tabId={activeId} initialText={panel.initialText} fieldRowHeight={BAR.panel.height - 2 * lift} onCancel={onCancel} onDone={onDone} />
      </OutsidePressArea>
    </Grow>
  );
}

function PanelSurface({ theme, radius, frosted = false }: { theme: Theme; radius: number; frosted?: boolean }) {
  return (
    <>
      {frosted ? <VisualEffect material={theme.dark ? "hudWindow" : "popover"} blendingMode="withinWindow" cornerRadius={radius} pointerEvents="none" style={StyleSheet.absoluteFill} /> : null}
      <Surface
        pointerEvents="none"
        fill={hex(theme.ntpBarSolid)}
        cornerRadius={radius}
        borderColor={hex(theme.ntpBarBorder)}
        borderWidth={StyleSheet.hairlineWidth}
        shadowColor={shadow.dialog.color}
        shadowOpacity={theme.panelShadowOpacity}
        shadowRadius={shadow.dialog.radius}
        shadowOffset={shadow.dialog.offset}
        style={StyleSheet.absoluteFill}
      />
    </>
  );
}

function CentredBar({ windowId, tabId, target, initialText, card }: { windowId: string; tabId: string; target?: NewTabTarget; initialText: string; card: Box }) {
  const windowTheme = useTheme();
  const theme = useMemo(() => windowTheme.profileColor === "sandDunes" && !windowTheme.custom
    ? { ...windowTheme, ...windowTheme.palettes.dark, ...sandDunes.commandPanel, powerUpColor: null }
    : { ...windowTheme, ntpBarSolid: withAlpha(windowTheme.ntpBarSolid, 0.66) }, [windowTheme]);
  const width = barWidth(card.width);
  const fixedRows = BAR.panel.height + BAR.bottom.height;
  const anchor = Math.max(WINDOW_MARGIN, Math.min(Math.round(card.height * CENTRED_TOP_SHARE), card.height - fixedRows - WINDOW_MARGIN));
  const frame = { width, left: card.left + (card.width - width) / 2, top: card.top + anchor };
  const maxResultsHeight = Math.max(0, card.height - anchor - fixedRows - WINDOW_MARGIN);
  const onCancel = () => closePanel(windowId);
  const onDone = (reason?: BarDismissal) => target ? closeNewTabBar(windowId) : closePanelToHeroBar(windowId, tabId, reason);
  return (
    <ThemeContext.Provider value={theme}>
      <Grow frame={frame} radius={PANEL_RADIUS} surface={<PanelSurface theme={theme} radius={PANEL_RADIUS} frosted />}>
        <OutsidePressArea onOutsidePress={target ? (e) => dismissNewTabSearchOnPress(windowId, e.nativeEvent.timestamp) : onCancel}>
          <Omnibox key={target ? `newTab:${target.kind}` : tabId} variant="panel" floating maxResultsHeight={maxResultsHeight} tabId={tabId} opensTab={target} initialText={initialText} onCancel={onCancel} onDone={onDone} />
        </OutsidePressArea>
      </Grow>
    </ThemeContext.Provider>
  );
}

function Grow({ frame, radius, surface, children }: {
  frame: { left: number; top: number; width: number };
  radius: number;
  surface: ReactNode;
  children: ReactNode;
}) {
  const [appear] = useState(() => new Animated.Value(reduceMotion() ? 1 : 0));
  useEffect(() => {
    if (reduceMotion()) {
      appear.setValue(1);
      return;
    }
    const open = Animated.timing(appear, { toValue: 1, ...GROW, useNativeDriver: true });
    open.start();
    return () => open.stop();
  }, [appear]);
  const scale = appear.interpolate({ inputRange: [0, 1], outputRange: [0.975, 1] });
  return (
    <Animated.View style={{ position: "absolute", ...frame, opacity: appear, transformOrigin: "center top", transform: [{ scale }] }}>
      {surface}
      <View style={{ overflow: "hidden", borderRadius: radius }}>{children}</View>
    </Animated.View>
  );
}
