import express, {type Express, type ErrorRequestHandler} from "express";
import cookieParser from "cookie-parser";
import {auth, requireAuth, requireAdmin} from "./auth.ts";

import {products, adminProducts, productErrorHandler} from "./products.ts";

import { commerce, adminOrders, commerceErrorHandler } from "./commerce.ts";

const app: Express = express();
app.disable("x-powered-by");
app.use(express.json({limit: "16kb"}));
app.use(cookieParser());
app.get("/api/health", (_request, response) => {
    response.json({data: {status: "ok"}});
});
app.use("/api/auth", auth);
app.use("/api", (_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
});
app.use("/api", products);
app.use("/api", requireAuth);
app.use("/api/admin", requireAdmin, adminProducts, adminOrders);
app.use("/api", commerce);
app.use(commerceErrorHandler);
app.use(productErrorHandler);
app.use((_request, response) => {
    response
        .status(404)
        .json({error: "NOT_FOUND", message: "Endpoint not found."});
});
const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
    if (
        error.type === "entity.parse.failed" ||
        error.type === "entity.too.large"
    ) {
        response
            .status(400)
            .json({
                error: "VALIDATION_ERROR",
                message: "Invalid JSON request body.",
            });
        return;
    }
    console.error(error);
    response
        .status(500)
        .json({
            error: "INTERNAL_ERROR",
            message: "Something went wrong. Please try again.",
        });
};
app.use(handleError);
export default app;
