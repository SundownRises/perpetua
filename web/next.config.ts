import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Keep the repo free of generated scaffolding a reviewer would have to skip past.
  agentRules: false,
};

export default config;
