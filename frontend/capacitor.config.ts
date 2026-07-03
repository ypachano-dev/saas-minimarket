import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.minimarket.app',
  appName: 'SaaS MiniMarket',
  webDir: 'dist',
  server: {
    cleartext: true
  }
};

export default config;
