import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.actionanand.lifeleaf.app',
  appName: 'Life Leaf',
  webDir: 'www',
  server: { androidScheme: 'https' },
  android: { backgroundColor: '#f4f6f0' },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_life_leaf',
      iconColor: '#28734d',
    },
    SplashScreen: {
      launchShowDuration: 1_800,
      backgroundColor: '#f4f6f0',
      showSpinner: false,
      androidScaleType: 'CENTER_INSIDE',
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
};

export default config;
