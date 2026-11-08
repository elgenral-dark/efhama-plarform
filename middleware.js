const OPEN_PAGES = new Set([
  "/login.html",
  "/register.html",
  "/offline.html",
  "/faq.html",
  "/glossary.html",
]);

export const config = {
  matcher: [
    "/",
    "/((?!api/|vendor/|assets/|css/|js/|_next/).*\\.html)",
    "/programming-paths/:path*",
    "/data/:path*",
  ],
};

function redirect(request, path) {
  return Response.redirect(new URL(path, request.url), 302);
}

export default async function middleware(request) {
  const { pathname } = new URL(request.url);
  if (OPEN_PAGES.has(pathname)) return undefined;

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl)
    return new Response("Authentication service is unavailable.", { status: 503 });

  let response;
  try {
    response = await fetch(`${backendUrl.replace(/\/+$/, "")}/api/auth/me`, {
      headers: request.headers.get("cookie") ? { cookie: request.headers.get("cookie") } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
  } catch (error) {
    console.error("Page authorization failed:", error.message);
    return new Response("Authentication service is unavailable.", { status: 503 });
  }
  if (response.status === 401)
    return pathname === "/" ? redirect(request, "/register.html") : redirect(request, "/login.html");
  if (!response.ok)
    return new Response("Authentication service is unavailable.", { status: 503 });

  const body = await response.json();
  const user = body.user;
  if (pathname === "/")
    return redirect(request, user && (user.role === "admin" || user.subscriptionStatus === "active")
      ? "/index.html"
      : "/register.html");
  if (!user) return redirect(request, "/login.html");
  if (pathname.startsWith("/admin") && user.role !== "admin")
    return new Response("Forbidden.", { status: 403 });
  if (pathname === "/notifications.html") return undefined;
  if (user.role !== "admin" && user.subscriptionStatus !== "active")
    return pathname.endsWith(".html")
      ? redirect(request, "/register.html?subscription=required")
      : new Response("Subscription required.", { status: 403 });
  return undefined;
}
