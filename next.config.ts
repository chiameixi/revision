import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow reading prompts.txt from the project root in API routes
  serverExternalPackages: [],
};

export default nextConfig;
