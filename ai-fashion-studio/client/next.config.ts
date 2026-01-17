import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  distDir: '.next',
  // 避免 Next.js 在 Windows 多 lockfile 场景下误判 workspace root
  // 并让输出追踪（standalone / output tracing）稳定在仓库根目录内。
  outputFileTracingRoot: path.join(configDir, '..'),
};

export default nextConfig;
