import {Router, type RequestHandler, type CookieOptions} from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {z} from "zod";
import {db} from "./db.ts";

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32)
    throw new Error("JWT_SECRET must contain at least 32 characters.");
const signingSecret: string = secret;
const cookieOptions: CookieOptions = {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
};
const credentials = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(255)),
    password: z
        .string()
        .refine(
            (value) =>
                Buffer.byteLength(value, "utf8") >= 8 &&
                Buffer.byteLength(value, "utf8") <= 72,
            "Password must be 8–72 UTF-8 bytes.",
        ),
});
const summary = {id: true, email: true, role: true} as const;

function setSession(
    response: Parameters<RequestHandler>[1],
    user: { id: string; role: string },
) {
    const token = jwt.sign({role: user.role}, signingSecret, {
        subject: user.id,
        expiresIn: "1h",
        algorithm: "HS256",
    });
    response.cookie("session", token, {
        ...cookieOptions,
        maxAge: 60 * 60 * 1000,
    });
}

function sessionUserId(token: unknown): string | null {
    if (typeof token !== "string") return null;
    try {
        const payload = jwt.verify(token, signingSecret, {algorithms: ["HS256"]});
        if (typeof payload === "string" || !z.uuid().safeParse(payload.sub).success) return null;
        return payload.sub ?? null;
    } catch {
        return null;
    }
}

export const requireAuth: RequestHandler = async (request, response, next) => {
    const id = sessionUserId(request.cookies?.session);
    if (!id) {
        response.status(401).json({
            error: "UNAUTHENTICATED",
            message: "Please sign in to continue.",
        });
        return;
    }
    const user = await db.user.findUnique({where: {id}, select: summary});
    if (!user) {
        response
            .status(401)
            .json({
                error: "UNAUTHENTICATED",
                message: "Please sign in to continue.",
            });
        return;
    }
    response.locals.user = user;
    next();
};
export const requireAdmin: RequestHandler = (_request, response, next) => {
    if (response.locals.user?.role !== "ADMIN") {
        response
            .status(403)
            .json({error: "FORBIDDEN", message: "Administrator access required."});
        return;
    }
    next();
};
export const auth = Router();
auth.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
});
auth.post("/register", async (request, response) => {
    const parsed = credentials.safeParse(request.body);
    if (!parsed.success) {
        response
            .status(400)
            .json({
                error: "VALIDATION_ERROR",
                message: "Enter a valid email and a password of 8–72 UTF-8 bytes.",
            });
        return;
    }
    const {email, password} = parsed.data;
    try {
        const user = await db.user.create({
            data: {
                email,
                passwordHash: await bcrypt.hash(password, 12),
                role: "USER",
            },
            select: summary,
        });
        setSession(response, user);
        response.status(201).json({data: user});
    } catch (error) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "P2002"
        ) {
            response
                .status(409)
                .json({
                    error: "EMAIL_IN_USE",
                    message: "This email is already registered.",
                });
            return;
        }
        throw error;
    }
});
auth.post("/login", async (request, response) => {
    const parsed = credentials.safeParse(request.body);
    if (!parsed.success) {
        response
            .status(400)
            .json({
                error: "VALIDATION_ERROR",
                message: "Enter a valid email and password.",
            });
        return;
    }
    const user = await db.user.findUnique({
        where: {email: parsed.data.email},
    });
    if (
        !user ||
        !(await bcrypt.compare(parsed.data.password, user.passwordHash))
    ) {
        response
            .status(401)
            .json({
                error: "INVALID_CREDENTIALS",
                message: "Email or password is incorrect.",
            });
        return;
    }
    setSession(response, user);
    response.json({data: {id: user.id, email: user.email, role: user.role}});
});
auth.post("/logout", (_request, response) => {
    response.clearCookie("session", cookieOptions);
    response.json({data: {success: true}});
});
auth.get("/me", requireAuth, (_request, response) => {
    response.json({data: response.locals.user});
});
