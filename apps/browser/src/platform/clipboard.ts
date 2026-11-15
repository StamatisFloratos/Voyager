import { nativeModule } from "@voyager/shell";

const Shell = nativeModule("ArdiaShell");

export const copyText = (text: string) => Shell.copyText(text);
export const readText = () => Shell.readText();
