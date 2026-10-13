import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yawmi.app',
  appName: 'يومي',
  webDir: 'dist-native',
  backgroundColor: '#f5f7f2',
  ios: {
    contentInset: 'never',
    backgroundColor: '#f5f7f2'
  },
  plugins: {
    LocalNotifications: {
      iconColor: '#28574a'
    }
  }
};

export default config;
