const HOME = "https://chatgpt.com/";

export function restorableChatGPTUrl(url: string): string {
  if (typeof url !== "string" || !url.startsWith(HOME + "?")) return url;
  const fields = url.slice(HOME.length + 1).split("#", 1)[0]!.split("&");
  return fields.some(field => field.startsWith("q=")) && fields.includes("hints=search") && fields.includes("ref=ext") ? HOME : url;
}
