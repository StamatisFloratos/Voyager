import { nativeModule } from "@voyager/shell";

export { completeInline, translation } from "@voyager/shell";

export const startDictation = () => nativeModule("ArdiaShell").startDictation();
