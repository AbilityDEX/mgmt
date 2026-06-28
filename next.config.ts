import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/*': ['./assets/fonts/**/*'],
  },
};

export default nextConfig;
