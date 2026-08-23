import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

@Injectable({ providedIn: 'root' })
export class ReminderService {
  async requestPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    if (window.LifeLeafNative?.notificationPermissionGranted?.()) {
      window.LifeLeafNative.ensureReminderNotificationChannel?.();
      return true;
    }
    if (window.LifeLeafNative?.requestNotificationPermission) {
      try {
        const response = await this.nativeResult('notification-permission', () =>
          window.LifeLeafNative?.requestNotificationPermission?.(),
        );
        const granted = response.success && response.data === 'granted';
        if (granted) window.LifeLeafNative?.ensureReminderNotificationChannel?.();
        return granted;
      } catch {
        return false;
      }
    }
    try {
      const current = await LocalNotifications.checkPermissions();
      if (current.display === 'granted') {
        window.LifeLeafNative?.ensureReminderNotificationChannel?.();
        return true;
      }
      const granted = (await LocalNotifications.requestPermissions()).display === 'granted';
      if (granted) window.LifeLeafNative?.ensureReminderNotificationChannel?.();
      return granted;
    } catch {
      return false;
    }
  }

  async schedule(enabled: boolean, time: string, days: number[]): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      await LocalNotifications.cancel({ notifications: Array.from({ length: 7 }, (_, index) => ({ id: 41 + index })) });
      if (!enabled) return true;
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted' && !window.LifeLeafNative?.notificationPermissionGranted?.()) return false;
      window.LifeLeafNative?.ensureReminderNotificationChannel?.();
      const [hour, minute] = time.split(':').map(Number);
      await LocalNotifications.schedule({
        notifications: days.map(weekday => ({
          id: 40 + weekday,
          title: 'A moment for today',
          body: "Write down something you'd like to remember.",
          schedule: { on: { weekday, hour, minute }, repeats: true, allowWhileIdle: true },
          smallIcon: 'ic_stat_life_leaf',
          iconColor: '#2f855a',
          channelId: 'life-leaf-reminders',
          extra: { route: '/write/new' },
        })),
      });
      return true;
    } catch {
      return false;
    }
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
