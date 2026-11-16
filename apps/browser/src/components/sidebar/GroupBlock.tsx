import { memo, useContext, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { useTheme } from "../ui/theme";
import { useGroup, usePageProfileId, useWindowId } from "../../state/browser/hooks";
import { updateGroup } from "../../state/groups/actions";
import { useGroupLabel } from "../../state/groups/hooks";
import { useSelectionInGroup } from "../../state/pins/hooks";
import { newCapture } from "../../state/sidebar/listCapture";
import { useCapturedGroupEntries, useGroupTabIds, useKeptEntries } from "../../state/sidebar/hooks";
import { MeetingTimeLabel, useMeetingCountdown } from "../live/MeetingCountdown";
import { ContextMenuArea, weight } from "../ui";
import { commitRename, endRename } from "../../state/sidebar/actions";
import { useDragFolded, useDragItem, useDropInto } from "./DragProvider";
import { useShift, type EntryMotion } from "./EntryMotion";
import { Fold, useFold } from "./Fold";
import { GROUP_BORDER, GROUP_INDENT, groupMembersPadBottom } from "./geometry";
import { entryHeightNow, foldedGroupHeight, headGap } from "../../state/sidebar/geometry";
import { dismissHover } from "../../state/sidebar/hover";
import { useRowHover } from "./hoverController";
import { GhostSlot, ListMotionContext, useGroupMotion } from "./ListMotion";
import { openGroupMenu } from "../../state/sidebar/menus";
import { registerRow, useSidebarUi } from "../../state/sidebar/sidebarUi";
import { CATEGORY_ROW, CategoryHeading } from "./CategoryHeading";
import { RenameField, SplitRowItem, TabRowItem } from "./TabRow";
import { groupTint } from "./tokens";
import { ListActionMotionContext } from "./listActionMotion";
import { entryKey, parseEntry } from "../../state/sidebar/entryKey";
import { LiveFolderBlock } from "./LiveFolderBlock";
import { tailKey, type RowSection } from "./dragModel";
import { SharedFolderMark } from "./SharedFolderMark";

export const GroupBlock = memo(function GroupBlock({
  groupId,
  section,
  parentGroup,
  motion: own = null,
}: {
  groupId: string;
  section: "list" | "pinnedGroups";
  parentGroup?: string;
  motion?: EntryMotion | null;
}) {
  const windowId = useWindowId();
  const stored = useGroup(groupId, (g) => !!g?.collapsed);
  const collapsed = useDragFolded(entryKey("group", groupId)) || stored;
  const tabIds = useGroupTabIds(groupId);
  const [captured] = useState(newCapture);
  const entries = useCapturedGroupEntries(groupId, captured);
  const selectedInside = useSelectionInGroup(windowId, groupId);
  const profileId = usePageProfileId();
  const keptEntries = useKeptEntries(windowId, profileId, groupId);
  const foldedHeight = () => foldedGroupHeight(windowId, profileId, groupId);
  const { wrapper, handle, headerRef } = useDragItem(entryKey("group", groupId), { kind: "group", tabIds, section, groupId, collapsed: stored, foldedHeight, parentGroup }, own?.clip);
  const tail = useDragItem(tailKey({ group: groupId }), { kind: "tail", tabIds: [], section, parentGroup: groupId });

  const fold = useFold(collapsed);
  const scope = useContext(ListMotionContext);
  const motion = useGroupMotion(windowId, profileId, groupId, entries, captured, section === "list" && !parentGroup ? scope : { enabled: scope.enabled, slideBelow: null }, scope.enabled && !collapsed);
  const [moved, movedRef] = useShift(own?.shift ?? null);
  return (
    <Animated.View ref={wrapper.ref} style={wrapper.style}>
      <View {...moved} ref={movedRef} style={[{ paddingVertical: GROUP_BORDER, paddingLeft: parentGroup ? GROUP_INDENT : 0 }, moved.style as object]}>
        <View ref={headerRef} {...handle}>
          <GroupHeader groupId={groupId} windowId={windowId} collapsed={collapsed} open={fold.open} />
        </View>
        <Fold
          fold={fold}
          collapsed={collapsed}
          entries={motion.slots(entries).map((slot) =>
            "ghost" in slot
              ? { key: slot.ghost.key, ghost: true, node: <GhostSlot snapshot={slot.ghost.snapshot} top={slot.top} opacity={slot.ghost.opacity} /> }
              : {
                  key: slot.entry,
                  node: (
                    <SidebarEntry entry={slot.entry} section={section} parentGroup={groupId} motion={motion.motion(slot.entry)} />
                  ),
                },
          )}
          keep={keptEntries}
          rowHeight={(key) => entryHeightNow(windowId, profileId, key)}
          padTop={headGap(collapsed && keptEntries.length ? keptEntries[0] : entries[0])}
          padBottom={groupMembersPadBottom(collapsed ? keptEntries.length : entries.length)}
          mountClosed={selectedInside}
          footer={<Animated.View ref={tail.wrapper.ref} style={tail.wrapper.style} />}
        />
        {motion.tail ? <Animated.View style={{ marginTop: motion.tail }} /> : null}
      </View>
    </Animated.View>
  );
});

export const SidebarEntry = memo(function SidebarEntry({
  entry,
  section,
  rowSection = section,
  parentGroup,
  motion: listMotion = null,
}: {
  entry: string;
  section: "list" | "pinnedGroups";
  rowSection?: RowSection;
  parentGroup?: string;
  motion?: EntryMotion | null;
}) {
  const windowId = useWindowId();
  const motion = useContext(ListActionMotionContext).get(entry) ?? listMotion;
  const { kind, id } = parseEntry(entry);
  if (kind === "live") return <LiveFolderBlock folderId={id} windowId={windowId} />;
  if (kind === "group") return <GroupBlock groupId={id} section={section} parentGroup={parentGroup} motion={motion} />;
  if (kind === "split") return <SplitRowItem splitId={id} section={rowSection} parentGroup={parentGroup} motion={motion} />;
  return <TabRowItem tabId={id} section={rowSection} parentGroup={parentGroup} motion={motion} />;
});

function GroupHeader({ groupId, windowId, collapsed, open }: { groupId: string; windowId: string; collapsed: boolean; open: Animated.Value }) {
  const theme = useTheme();
  const group = useGroup(groupId, (g) => g);
  const label = useGroupLabel(groupId);
  const renaming = useSidebarUi((u) => u.renaming?.kind === "group" && u.renaming.id === groupId);
  const dropInto = useDropInto() === groupId;
  const { hoverProps } = useRowHover(windowId, collapsed && !renaming ? { kind: "group", id: groupId } : null);
  const countdown = useMeetingCountdown(groupId);
  if (!group) return null;
  const target = { kind: "group" as const, id: groupId };

  const tint = groupTint(group.color);
  const toggle = () => {
    dismissHover();
    if (!renaming) updateGroup(groupId, { collapsed: !collapsed });
  };

  return (
    <View ref={(v) => registerRow(windowId, groupId, v)} {...hoverProps}>
      <ContextMenuArea
        onContextMenu={() => {
          dismissHover();
          void openGroupMenu(windowId, groupId);
        }}
      >
        <Pressable
          focusable={!renaming}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ expanded: !collapsed }}
          aria-expanded={!collapsed}
          onAccessibilityTap={toggle}
          onPress={toggle}
        >
          {renaming ? (
            <View style={CATEGORY_ROW}>
              <RenameField
                flush
                initial={group.name}
                placeholder={label}
                color={theme.textSecondary}
                weight={weight.semibold}
                onDone={(text) => (text === null ? endRename(target) : commitRename(target, text))}
              />
            </View>
          ) : (
            <CategoryHeading label={label} open={open} tint={tint} dropTarget={dropInto}>
              <SharedFolderMark groupId={groupId} />
              {countdown.label ? (
                <Animated.View style={{ transform: [{ rotate: countdown.rotate }] }}>
                  <MeetingTimeLabel label={countdown.label} urgent={countdown.urgent} />
                </Animated.View>
              ) : null}
            </CategoryHeading>
          )}
        </Pressable>
      </ContextMenuArea>
    </View>
  );
}
