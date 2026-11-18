export const OPEN_PAGES = new Set([
  "/login.html",
  "/register.html",
  "/offline.html",
  "/explore/",
  "/explore/index.html",
  "/explore/chapters.html",
  "/explore/paths.html",
  "/explore/projects.html",
]);

export const STAFF_ROLES = new Set([
  "admin",
  "super_admin",
  "instructor",
  "content_manager",
  "analyst",
  "support",
]);

export function isGuardedPath(path) {
  if (typeof path !== "string") return false;
  // مسارات لوحة التحكم تدار بشكل منفصل
  if (path.startsWith("/admin")) return false;
  // الصفحات العامة المفتوحة للزوار
  if (OPEN_PAGES.has(path) || path.startsWith("/explore/")) return false;
  // حماية مسارات التعلم والمحرر البرمجي
  if (path.startsWith("/programming-paths")) return true;
  // حماية جميع صفحات المنصة الأساسية وملفات html
  return /\.html$/i.test(path) || /^\/(index|chapters|chapter|lesson|quiz|glossary|search|faq|notifications)($|\?)/i.test(path);
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
  // حماية مسارات لوحة التحكم (الداشبورد): تمنع الطلاب صراحة وتسمح للإداريين أو لغير المسجلين لرؤية شاشة الدخول
  if (path === "/admin" || path.startsWith("/admin/")) {
    if (!cookie) return { action: "next" };
    try {
      const user = await currentUser({ backendUrl, cookie, fetchImpl });
      if (user && !STAFF_ROLES.has(user.role)) {
        return { action: "forbidden" };
      }
      return { action: "next", user };
    } catch {
      return { action: "next" };
    }
  }

  if (!isGuardedPath(path)) return { action: "next" };

  let user;
  try {
    user = await currentUser({ backendUrl, cookie, fetchImpl });
  } catch {
    return { action: "unavailable" };
  }

  if (!user) return { action: "login" };
  if ((["/admin-subscriptions.html", "/admin-dashboard.html"].includes(path) || path.startsWith("/dashboard/"))
    && (!user || !STAFF_ROLES.has(user.role)))
    return { action: "forbidden" };
  if (!hasSubscription(user)) return { action: "subscription" };
  return { action: "next", user };
}
