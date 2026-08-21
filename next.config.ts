import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  env: {
    ROANUZ_PROJECT_KEY: process.env.ROANUZ_PROJECT_KEY || "",
    ROANUZ_API_KEY: process.env.ROANUZ_API_KEY || "",
    ROANUZ_FOOTBALL_ACCESS_KEY: process.env.ROANUZ_FOOTBALL_ACCESS_KEY || "",
    ROANUZ_FOOTBALL_SECRET_KEY: process.env.ROANUZ_FOOTBALL_SECRET_KEY || "",
    ROANUZ_FOOTBALL_APP_ID: process.env.ROANUZ_FOOTBALL_APP_ID || "",
  },
  serverExternalPackages: ["firebase-admin"],
  async headers() {
    return [
      
      {
        source: "/Content/Drops/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Apply these headers to all API routes to fix the CORS error
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: process.env.NEXT_PUBLIC_FRONTEND_URL || "https://sportsfan-frontend.vercel.app" }, 
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version" },
        ],
      },
    ];
  },
};

export default nextConfig;
