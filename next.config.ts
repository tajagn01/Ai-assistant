import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["discord.js"],
  turbopack: {},
  webpack: (config) => {
    config.externals = [...(config.externals || []), "zlib-sync"];
    return config;
  },
};

export default nextConfig;
