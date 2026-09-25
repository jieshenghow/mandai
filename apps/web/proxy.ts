import {NextResponse, type NextRequest} from "next/server";
import {redirectFor, type Role} from "./lib/route-access";

function serviceUnavailable() {
    return new NextResponse(
        `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Service unavailable</title><body style="background:#010102;color:#f7f8f8;font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0"><main style="padding:24px"><p style="color:#8a8f98">503</p><h1>Temporarily unavailable</h1><p>We couldn’t check your session. Please try again shortly.</p><a href="" style="color:#828fff">Try again</a></main></body></html>`,
        {
            status: 503,
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
            },
        },
    );
}

export async function proxy(request: NextRequest) {
    let role: Role | null = null;
    const session = request.cookies.get("session");
    if (session) {
        try {
            const response = await fetch(
                `${process.env.API_PROXY_TARGET ?? "http://localhost:4000"}/api/auth/me`,
                {
                    headers: {Cookie: `session=${encodeURIComponent(session.value)}`},
                    cache: "no-store",
                    signal: AbortSignal.timeout(5000),
                },
            );
            if (response.ok) {
                const {data} = await response.json();
                if (data?.role !== "USER" && data?.role !== "ADMIN")
                    return serviceUnavailable();
                role = data.role;
            } else if (response.status !== 401) {
                return serviceUnavailable();
            }
        } catch {
            return serviceUnavailable();
        }
    }
    const target = redirectFor(request.nextUrl.pathname, role);
    const response = target
        ? NextResponse.redirect(new URL(target, request.url))
        : NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    if (session && !role)
        response.cookies.set("session", "", {path: "/", maxAge: 0});
    return response;
}

export const config = {
    matcher: [
        "/((?!api(?:/|$)|_next(?:/|$)|favicon.ico$|robots.txt$|sitemap.xml$).*)",
    ],
};
