import { decide, hasSubscription, currentUser } from "./lib/guard.js";

export const config = {
  matcher: [
    "/",
    "/((?!api/|data/|vendor/|assets/|css/|js/|_next/).*\\.html)",
    "/programming-paths/:path*",
  ],
};

export default async function middleware(request) {
  const { pathname } = new URL(request.url);
  const backendUrl = process.env.BACKEND_URL || "";

  if (pathname === "/") {
    try {
      if (!backendUrl) return Response.redirect(new URL("/explore/", request.url));
      const user = await currentUser({
        backendUrl,
        cookie: request.headers.get("cookie") || "",
      });
      if (user && hasSubscription(user)) return undefined;
    } catch {
      return Response.redirect(new URL("/explore/", request.url));
    }
    return Response.redirect(new URL("/explore/", request.url));
  }

  const result = await decide({
    path: pathname,
    backendUrl,
    cookie: request.headers.get("cookie") || "",
  });
  if (result.action === "next") return undefined;
  if (result.action === "unavailable")
    return new Response("تعذر التحقق من صلاحيات الحساب.", { status: 503 });
  if (result.action === "forbidden")
    return new Response("صلاحيات المسؤول مطلوبة.", { status: 403 });
  if (result.action === "subscription")
    return Response.redirect(new URL("/register.html", request.url));
  if (pathname.startsWith("/programming-paths/"))
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  return Response.redirect(new URL("/login.html", request.url));
}
