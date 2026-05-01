import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, max-age=0',
          },
        ],
      },
    ];
  },
  
  devIndicators: false,
  
  // 允许开发模式下的跨域请求
  allowedDevOrigins: [
    'word.qiyuan.icu',
    'violetteam.cloud',
    'localhost:3000',
    '10.4.0.3:3000'
  ],
  
  // 禁用严格模式以避免开发时的警告
  reactStrictMode: false
};

export default nextConfig;
