import { nativeModule, type LocationPermission } from "@voyager/shell";

export type { LocationPermission };

const Location = nativeModule("ArdiaLocation");

export const locationPermission = () => Location.locationPermission();
export const requestLocationPermission = () => Location.requestLocationPermission();
export const openLocationSettings = () => Location.openLocationSettings();
