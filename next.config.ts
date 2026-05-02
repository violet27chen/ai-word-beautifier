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
    '127.0.0.1',
    '127.0.0.1:3000',
    '10.4.0.3:3000',
    'run-agent-69f4af918281299a7f506021-moolp1gt-preview.agent-sandbox-my-c1-gw.trae.ai',
    'run-agent-69f4af918281299a7f506021-moolp1gt.remote-agent.svc.cluster.local'
  ],
  
  // 禁用严格模式以避免开发时的警告
  reactStrictMode: false
};

export default nextConfig;
