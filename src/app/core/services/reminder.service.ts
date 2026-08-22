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
      const result = this.nativeResult('notification-permission');
      window.LifeLeafNative.requestNotificationPermission();
      const response = await result;
      return response.success && response.data === 'granted';
    }
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    return (await LocalNotifications.requestPermissions()).display === 'granted';
  }

  async schedule(enabled: boolean, time: string, days: number[]): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
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
  }

  private nativeResult(action: string): Promise<LifeLeafNativeResult> {
    return new Promise(resolve => {
      const listener = (event: Event) => {
        const detail = (event as CustomEvent<LifeLeafNativeResult>).detail;
        if (detail.action !== action) return;
        window.removeEventListener('life-leaf-native-result', listener);
        resolve(detail);
      };
      window.addEventListener('life-leaf-native-result', listener);
    });
  }
}
