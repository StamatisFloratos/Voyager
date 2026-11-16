import type { GestureResponderEvent } from "react-native";

export type ClickModifiers = { metaKey: boolean; altKey: boolean; shiftKey: boolean };
export function modifiersOf(e: GestureResponderEvent | undefined): ClickModifiers {
  const n = (e?.nativeEvent ?? {}) as Partial<ClickModifiers>;
  return { metaKey: !!n.metaKey, altKey: !!n.altKey, shiftKey: !!n.shiftKey };
}

type WithHistory = GestureResponderEvent & { touchHistory?: { touchBank: ({ startTimeStamp: number } | null | undefined)[] } };

export const pressStart = (e: GestureResponderEvent) => (e as WithHistory).touchHistory?.touchBank[Number(e.nativeEvent.identifier)]?.startTimeStamp;
