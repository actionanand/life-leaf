import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import {
  AlertController,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToggle,
  IonToolbar,
  SegmentCustomEvent,
  ToggleCustomEvent,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  archiveOutline,
  chevronForwardOutline,
  cloudDownloadOutline,
  contrastOutline,
  downloadOutline,
  fingerPrintOutline,
  informationCircleOutline,
  lockClosedOutline,
  moonOutline,
  notificationsOutline,
  shieldCheckmarkOutline,
  sunnyOutline,
  trashOutline,
} from 'ionicons/icons';
import { DiarySettings, ThemePreference } from '../../core/models/diary.models';
import { DiaryService } from '../../core/services/diary.service';
import { ConfirmationService } from '../../core/services/confirmation.service';
import { ReminderService } from '../../core/services/reminder.service';
import { SnackbarService } from '../../core/services/snackbar.service';

@Component({
  selector: 'app-settings-page',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  imports: [
    RouterLink,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonSegment,
    IonSegmentButton,
    IonTitle,
    IonToggle,
    IonToolbar,
  ],
})
export class SettingsPage {
  readonly diary = inject(DiaryService);
  private readonly reminders = inject(ReminderService);
  private readonly confirmations = inject(ConfirmationService);
  private readonly snackbar = inject(SnackbarService);
  private readonly alerts = inject(AlertController);
  readonly native = Capacitor.isNativePlatform();
  readonly version = signal(window.LifeLeafNative?.appVersion() || '0.1.0');
  readonly weekdays = [
    { value: 2, label: 'M', name: 'Monday' },
    { value: 3, label: 'T', name: 'Tuesday' },
    { value: 4, label: 'W', name: 'Wednesday' },
    { value: 5, label: 'T', name: 'Thursday' },
    { value: 6, label: 'F', name: 'Friday' },
    { value: 7, label: 'S', name: 'Saturday' },
    { value: 1, label: 'S', name: 'Sunday' },
  ];

  constructor() {
    addIcons({
      archiveOutline,
      chevronForwardOutline,
      cloudDownloadOutline,
      contrastOutline,
      downloadOutline,
      fingerPrintOutline,
      informationCircleOutline,
      lockClosedOutline,
      moonOutline,
      notificationsOutline,
      shieldCheckmarkOutline,
      sunnyOutline,
      trashOutline,
    });
  }

  async ionViewWillEnter(): Promise<void> {
    await this.diary.initialize();
  }

  themeChanged(event: SegmentCustomEvent): void {
    void this.update({ theme: event.detail.value as ThemePreference });
  }
  toggle(key: 'writingPrompts' | 'showStreak' | 'onThisDay', event: ToggleCustomEvent): void {
    void this.update({ [key]: event.detail.checked });
  }
  async reminderChanged(event: ToggleCustomEvent): Promise<void> {
    const enabled = event.detail.checked;
    if (!enabled) {
      await this.reminders.schedule(false, this.diary.settings().reminderTime, this.diary.settings().reminderDays);
      await this.update({ reminderEnabled: false });
      await this.snackbar.show('Reminder turned off');
      return;
    }
    if (!this.native) {
      await this.update({ reminderEnabled: false });
      await this.snackbar.show('Reminders are available in the Android app');
      return;
    }
    const explained = await this.confirmations.confirm({
      header: 'Allow diary reminders?',
      message:
        'Life Leaf needs notification permission to show your selected reminder. Notifications use private wording and never include diary content.',
      confirmText: 'Allow notifications',
      cancelText: 'Not now',
    });
    if (!explained) {
      await this.update({ reminderEnabled: false });
      return;
    }
    if (!(await this.reminders.requestPermission())) {
      await this.update({ reminderEnabled: false });
      await this.snackbar.show('Notification permission was not allowed', { duration: 3_200 });
      return;
    }
    const scheduled = await this.reminders.schedule(
      true,
      this.diary.settings().reminderTime,
      this.diary.settings().reminderDays,
    );
    await this.update({ reminderEnabled: scheduled });
    await this.snackbar.show(scheduled ? 'Reminder enabled' : 'Reminder could not be scheduled');
  }
  screenshotChanged(event: ToggleCustomEvent): void {
    const enabled = event.detail.checked;
    window.LifeLeafNative?.setScreenshotProtection(enabled);
    void this.update({ screenshotProtection: enabled });
  }
  async reminderTimeChanged(time: string): Promise<void> {
    await this.update({ reminderTime: time });
    if (this.diary.settings().reminderEnabled)
      await this.reminders.schedule(true, time, this.diary.settings().reminderDays);
  }
  async toggleReminderDay(day: number): Promise<void> {
    const current = this.diary.settings().reminderDays;
    const reminderDays = current.includes(day) ? current.filter(value => value !== day) : [...current, day];
    if (!reminderDays.length) return;
    await this.update({ reminderDays });
    if (this.diary.settings().reminderEnabled) {
      await this.reminders.schedule(true, this.diary.settings().reminderTime, reminderDays);
    }
  }
  onTimeInput(event: Event): void {
    void this.reminderTimeChanged((event.target as HTMLInputElement).value);
  }
  async privacyInfo(): Promise<void> {
    await this.notice(
      'Private by design',
      'Your diary stays on this device. Life Leaf has no account, analytics, advertisements, trackers, or automatic cloud upload.',
    );
  }

  private async update(patch: Partial<DiarySettings>): Promise<void> {
    await this.diary.updateSettings({ ...this.diary.settings(), ...patch });
  }
  private async notice(header: string, message: string): Promise<void> {
    const alert = await this.alerts.create({ header, message, cssClass: 'life-leaf-confirmation', buttons: ['OK'] });
    await alert.present();
  }
}
