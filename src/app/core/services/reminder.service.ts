import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

@Injectable({ providedIn: 'root' })
export class ReminderService {
  private readonly channelId = 'life-leaf-reminders';

  async requestPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    if (window.LifeLeafNative?.notificationPermissionGranted?.()) {
      await this.ensureChannel();
      return true;
    }
    try {
      const current = await LocalNotifications.checkPermissions();
      if (current.display === 'granted') {
        await this.ensureChannel();
        return true;
      }
      const granted = (await LocalNotifications.requestPermissions()).display === 'granted';
      if (granted) await this.ensureChannel();
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
      await this.ensureChannel();
      const [hour, minute] = time.split(':').map(Number);
      await LocalNotifications.schedule({
        notifications: days.map(weekday => ({
          id: 40 + weekday,
          title: 'A moment for today',
          body: "Write down something you'd like to remember.",
          schedule: { on: { weekday, hour, minute }, repeats: true, allowWhileIdle: true },
          smallIcon: 'ic_stat_life_leaf',
          iconColor: '#2f855a',
          channelId: this.channelId,
          isExactNotification: false,
          autoCancel: true,
          extra: { route: '/write/new' },
        })),
      });
      return true;
    } catch {
      return false;
    }
  }

  private async ensureChannel(): Promise<void> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    await LocalNotifications.createChannel({
      id: this.channelId,
      name: 'Diary reminders',
      description: 'Private reminders to write in Life Leaf',
      importance: 3,
      visibility: 0,
      lights: true,
      lightColor: '#2f855a',
      vibration: true,
    });
  }
}
