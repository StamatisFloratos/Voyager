const titleInk = "#1F1905";

export const sandDunes = {
  swatch: "#DFD9C4",
  backdrop: {
    themeColors: [229 / 255, 223 / 255, 202 / 255, 1],
    themeTexture: "sand" as const,
    themeGrain: 0.08,
  },
  commandPanel: {
    ntpBarSolid: "rgba(101,83,55,0.56)",
    ntpBarBorder: "rgba(255,241,210,0.29)",
    panelShadowOpacity: 0.32,
    textPrimary: "#FFFBF0",
    textSecondary: "#F1E6CF",
    textTertiary: "#D9CEB7",
    placeholder: "#E7DCC6",
    chipText: "#E7DCC6",
    icon: "#F1E6CF",
    selection: "rgba(224,199,145,0.45)",
    commandBarSelected: "rgba(255,242,210,0.16)",
    commandBarHover: "rgba(255,242,210,0.09)",
  },
  chrome: {
    card: "rgba(0,0,0,0)",
    textPrimary: titleInk,
    textTab: titleInk,
    rowSelectedText: titleInk,
    tabSelectedText: titleInk,
    textSecondary: "#585446",
    icon: "#59564B",
    tabSelected: "rgba(251,251,253,0.8)",
    tabSelectedShadowRadius: 3,
    tabHover: "rgba(255,255,255,0.24)",
    tabPressed: "rgba(255,255,255,0.42)",
    pinnedResting: "rgba(48,39,17,0.07)",
    pinnedRestingStroke: "rgba(48,39,17,0.04)",
  },
};
