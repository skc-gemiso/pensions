import type { NextConfig } from "next";
import path from "path";
import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: path.resolve(process.cwd(), "config/.env"), override: true });

const nextConfig: NextConfig = {};

export default nextConfig;
