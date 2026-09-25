import type {NextConfig} from "next";

const nextConfig: NextConfig = {
    allowedDevOrigins: ["10.211.55.32"],
    async rewrites() {
        return [
            {
                source: "/api/:path*",
                destination: `${process.env.API_PROXY_TARGET ?? "http://localhost:4000"}/api/:path*`,
            },
        ];
    },
};

export default nextConfig;
