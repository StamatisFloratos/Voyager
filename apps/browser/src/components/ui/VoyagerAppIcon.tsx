import { Image } from "react-native";
import { APP_ICON } from "./brandImages";

export function VoyagerAppIcon({ size }: { size: number }) {
  return <Image source={APP_ICON} resizeMode="contain" style={{ width: size, height: size, borderRadius: size * 0.22 }} />;
}
