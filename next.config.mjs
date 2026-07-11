/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emits .next/standalone with a self-contained server.js — this is what makes
  // the Docker image small and dependency-free at runtime.
  output: "standalone",
};

export default nextConfig;
