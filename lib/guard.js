export const OPEN_PAGES = new Set([
  "/login.html",
  "/register.html",
  "/offline.html",
  "/faq.html",
  "/glossary.html",
]);

export function isGuardedPath(path) {
  return path === "/"
    || path.startsWith("/programming-paths/")
    || path.startsWith("/data/")
    || (path.endsWith(".html") && !OPEN_PAGES.has(path));
}

export function hasSubscription(user) {
  return user?.role === "admin" || user?.subscriptionStatus === "active";
}

export async function currentUser({ backendUrl, cookie } = {}) {
  if (!backendUrl) throw new Error("BACKEND_URL is required to authorize protected pages");
  const response = await fetch(`${backendUrl.replace(/\/+$/, "")}/api/auth/me`, {
    headers: cookie ? { cookie } : {},
    cache: "no-store",
    signal: AbortSignal.timeout(3000),
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Authentication backend returned ${response.status}`);
  const body = await response.json();
  return body.user || null;
}

export async function decide({ path, backendUrl, cookie } = {}) {
  if (OPEN_PAGES.has(path) || !isGuardedPath(path)) return { action: "next" };

  const user = await currentUser({ backendUrl, cookie });
  const isHtml = path.endsWith(".html") || path === "/";
  if (path === "/")
    return { action: "redirect", location: user && hasSubscription(user) ? "/index.html" : "/register.html" };
  if (!user) {
    return isHtml
      ? { action: "redirect", location: "/login.html" }
      : { action: "unauthorized", status: 401 };
  }
  if (path.startsWith("/admin") && user.role !== "admin")
    return { action: "forbidden", status: 403 };
  if (path === "/notifications.html") return { action: "next" };
  if (!hasSubscription(user)) {
    return isHtml
      ? { action: "redirect", location: "/register.html?subscription=required" }
      : { action: "subscription_required", status: 403 };
  }
  return { action: "next" };
}
