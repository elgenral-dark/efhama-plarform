export const OPEN_PAGES = new Set([
  "/login.html",
  "/register.html",
  "/offline.html",
  "/explore/index.html",
  "/explore/chapters.html",
  "/explore/paths.html",
  "/explore/projects.html",
]);

export function isGuardedPath(path) {
  if (typeof path !== "string" || OPEN_PAGES.has(path)) return false;
  return path.startsWith("/programming-paths/") || /\.html$/i.test(path);
}

export function hasSubscription(user) {
  return !!user && (user.role === "admin" || user.subscriptionStatus === "active");
}

export async function currentUser({ backendUrl, cookie, fetchImpl = fetch } = {}) {
  if (!backendUrl) throw new Error("Backend URL is not configured");
  const response = await fetchImpl(`${backendUrl.replace(/\/+$/, "")}/api/auth/me`, {
    headers: cookie ? { cookie } : {},
    signal: AbortSignal.timeout(5000),
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Backend auth check failed with status ${response.status}`);
  const result = await response.json();
  return result.user || null;
}

export async function decide({ path, backendUrl, cookie, fetchImpl = fetch } = {}) {
  if (!isGuardedPath(path)) return { action: "next" };

  let user;
  try {
    user = await currentUser({ backendUrl, cookie, fetchImpl });
  } catch {
    return { action: "unavailable" };
  }
  if (!user) return { action: "login" };
  if ((["/admin-subscriptions.html", "/admin-dashboard.html"].includes(path) || path.startsWith("/dashboard/"))
    && user.role !== "admin")
    return { action: "forbidden" };
  if (!hasSubscription(user)) return { action: "subscription" };
  return { action: "next", user };
}
