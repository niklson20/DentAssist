import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["hash-wasm", "nodemailer"],
};

export default nextConfig;
