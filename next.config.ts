import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure three.js / web-ifc / That Open packages are transpiled for the App Router.
  transpilePackages: [
    "three",
    "web-ifc",
    "@thatopen/components",
    "@thatopen/fragments",
  ],
};

export default nextConfig;
