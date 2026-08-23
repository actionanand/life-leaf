import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';

@Injectable({ providedIn: 'root' })
export class ReminderService {
  async requestPermission(): Promise<boolean> {
    if (!this.androidBridge()) return false;
    if (window.LifeLeafNative?.notificationPermissionGranted?.()) {
      return true;
    }
    try {
      const response = await this.nativeResult('notification-permission', () =>
        window.LifeLeafNative?.requestNotificationPermission?.(),
      );
      return response.success && response.data === 'granted';
    } catch {
      return false;
    }
  }

  async schedule(enabled: boolean, time: string, days: number[]): Promise<boolean> {
    if (!this.androidBridge()) return false;
    try {
      if (!enabled) {
        const cancelled = await this.nativeResult('reminder-cancel', () => window.LifeLeafNative?.cancelReminder?.());
        return cancelled.success;
      }
      if (!window.LifeLeafNative?.notificationPermissionGranted?.()) return false;
      const [hour, minute] = time.split(':').map(Number);
      const scheduled = await this.nativeResult('reminder-schedule', () =>
        window.LifeLeafNative?.scheduleReminder?.(hour, minute, days.join(',')),
      );
      return scheduled.success;
    } catch {
      return false;
    }
  }

  private androidBridge(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && !!window.LifeLeafNative;
  }

  private nativeResult(action: string, start: () => void, timeoutMs = 60_000): Promise<LifeLeafNativeResult> {
    return new Promise((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const finish = (result?: LifeLeafNativeResult, error?: Error): void => {
        if (timeout) clearTimeout(timeout);
        window.removeEventListener('life-leaf-native-result', listener);
        if (result) resolve(result);
        else reject(error ?? new Error('The Android request could not be completed.'));
      };
      const listener = (event: Event) => {
        const detail = (event as CustomEvent<LifeLeafNativeResult>).detail;
        if (detail.action !== action) return;
        finish(detail);
      };
      window.addEventListener('life-leaf-native-result', listener);
      timeout = setTimeout(() => finish(undefined, new Error('The Android request timed out.')), timeoutMs);
      try {
        start();
      } catch (error) {
        finish(undefined, error instanceof Error ? error : new Error('The Android request could not be started.'));
      }
    });
  }
}
