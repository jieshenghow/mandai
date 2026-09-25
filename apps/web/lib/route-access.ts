export type Role = "USER" | "ADMIN";
export type User = { id: string; email: string; role: Role };

export function homeFor(role: Role) {
    return role === "ADMIN" ? "/admin" : "/";
}

export function routeGroup(pathname: string): "auth" | "app" | "admin" {
    const path = pathname.replace(/\/+$/, "") || "/";
    if (path === "/login" || path === "/register") return "auth";
    if (path === "/admin" || path.startsWith("/admin/")) return "admin";
    return "app";
}

export function redirectFor(
    pathname: string,
    role: Role | null,
): string | null {
    const group = routeGroup(pathname);
    if (group === "auth") return role ? homeFor(role) : null;
    if (!role) return "/login";
    if (group === "admin" && role !== "ADMIN") return "/";
    return null;
}
