import { defineCloudflareConfig } from '@opennextjs/cloudflare';

const openNextConfig = {
  ...defineCloudflareConfig(),
  // OpenNext must invoke the plain Next.js build instead of calling itself.
  buildCommand: 'npm run build:next',
};

export default openNextConfig;
