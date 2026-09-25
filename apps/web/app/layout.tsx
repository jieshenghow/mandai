import type {Metadata} from "next";
import "./globals.css";
import {QueryProvider} from "@/components/query-provider";

export const metadata: Metadata = {
    title: "Mandai Assessment",
    description: "Product management storefront and inventory dashboard",
};

export default function RootLayout({children}: LayoutProps<"/">) {
    return (
        <html lang="en" className="scheme-light">
        <body className="bg-canvas font-sans text-[14px] text-text">
        <QueryProvider>{children}</QueryProvider>
        </body>
        </html>
    );
}
