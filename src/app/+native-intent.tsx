
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string {
  if (!initial) return path;

  const incomingPath = typeof path === "string" ? path.trim() : "";

  if (!incomingPath) return "/";

  if (/^forexsignalsapp:\/\/\/?$/i.test(incomingPath)) {
    return "/";
  }

  try {
    const url = new URL(incomingPath);

    if (
      url.protocol.toLowerCase() === "forexsignalsapp:" &&
      !url.hostname &&
      (url.pathname === "" || url.pathname === "/") &&
      !url.search &&
      !url.hash
    ) {
      return "/";
    }
  } catch {
    // Preserve unexpected paths instead of crashing during startup.
  }

  return path;
}
