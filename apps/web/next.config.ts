import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["game-core", "contracts-abi"],
};

export default nextConfig;
