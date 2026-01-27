// eslint-disable-next-line @typescript-eslint/no-require-imports -- Next.js config runs in CJS by default
const path = require('node:path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: '.next',
  // 避免 Next.js 在 Windows 多 lockfile 场景下误判 workspace root
  // 并让输出追踪（standalone / output tracing）稳定在仓库根目录内。
  outputFileTracingRoot: path.join(__dirname, '..'),
  // 配置 API 代理，解决本地开发跨域和端口问题
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
