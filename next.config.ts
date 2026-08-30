import type { NextConfig } from "next";
import path from "path";
import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: path.resolve(process.cwd(), "config/.env"), override: true });

const nextConfig: NextConfig = {
  // data/*.md 는 app/ 밖이라 파일 트레이싱이 자동으로 잡지 못한다.
  // 빠뜨리면 로컬은 정상인데 Vercel 배포본에서만 ENOENT 가 난다. (docs/environment.md 「data/」 절)
  outputFileTracingIncludes: {
    "/invest/jangam2": ["./data/**/*.md"],
  },
};

export default nextConfig;
