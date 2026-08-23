interface LifeLeafNativeBridge {
  setScreenshotProtection(enabled: boolean): void;
  appVersion(): string;
  exportFile(filename: string, mimeType: string, contents: string): void;
  setDarkMode(enabled: boolean): void;
  disableBiometric?(): void;
  isBiometricAvailable?(): boolean;
  enableBiometric?(secret: string): void;
  authenticateBiometric?(): void;
  notificationPermissionGranted?(): boolean;
  requestNotificationPermission?(): void;
  ensureReminderNotificationChannel?(): void;
  scheduleReminder?(hour: number, minute: number, daysCsv: string): void;
  cancelReminder?(): void;
}

interface LifeLeafShareDetail {
  type: string;
  text: string;
  uri: string;
}

interface LifeLeafNativeResult {
  action: string;
  success: boolean;
  data: string;
  message: string;
}

interface Window {
  LifeLeafNative?: LifeLeafNativeBridge;
}
