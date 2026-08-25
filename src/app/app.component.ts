import { Component, OnDestroy, inject } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { PluginListenerHandle } from '@capacitor/core';
import { LocalNotifications, LocalNotificationActionPerformed } from '@capacitor/local-notifications';
import { Subscription, filter } from 'rxjs';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { DiaryService } from './core/services/diary.service';
import { createBlankEntry } from './core/models/diary.models';
import { AttachmentService } from './core/services/attachment.service';
import { SecurityService } from './core/services/security.service';
import { ReminderService } from './core/services/reminder.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnDestroy {
  private readonly diary = inject(DiaryService);
  private readonly router = inject(Router);
  private readonly attachmentStorage = inject(AttachmentService);
  private readonly security = inject(SecurityService);
  private readonly reminders = inject(ReminderService);
  private stateListener?: PluginListenerHandle;
  private notificationListener?: PluginListenerHandle;
  private readonly navigationSubscription: Subscription;
  private readonly shareListener = (event: Event) =>
    void this.acceptShare((event as CustomEvent<LifeLeafShareDetail>).detail);

  constructor() {
    void this.initializeDiaryAndReminders().catch(() => undefined);
    window.addEventListener('life-leaf-share', this.shareListener);
    this.navigationSubscription = this.router.events
      .pipe(filter((event): event is NavigationStart => event instanceof NavigationStart))
      .subscribe(event => {
        if (this.security.configured() && !this.security.unlocked() && event.url !== '/lock')
          void this.router.navigateByUrl('/lock');
      });
    void this.initializeSecurity().catch(() => undefined);
    void this.initializeNotificationActions().catch(() => undefined);
  }

  ngOnDestroy(): void {
    window.removeEventListener('life-leaf-share', this.shareListener);
    this.navigationSubscription.unsubscribe();
    void this.stateListener?.remove();
    void this.notificationListener?.remove();
  }

  private async initializeDiaryAndReminders(): Promise<void> {
    await this.diary.initialize();
    const settings = this.diary.settings();
    if (settings.reminderEnabled) {
      await this.reminders.schedule(true, settings.reminderTime, settings.reminderDays);
    }
  }

  private async initializeSecurity(): Promise<void> {
    await this.security.initialize();
    if (this.security.configured()) await this.router.navigateByUrl('/lock', { replaceUrl: true });
    this.stateListener = await App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) this.security.lock();
      else if (this.security.configured() && !this.security.unlocked()) void this.router.navigateByUrl('/lock');
    });
  }

  private async initializeNotificationActions(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    this.notificationListener = await LocalNotifications.addListener(
      'localNotificationActionPerformed',
      action => void this.openNotification(action),
    );
  }

  private async openNotification(action: LocalNotificationActionPerformed): Promise<void> {
    const requestedRoute = action.notification.extra?.['route'];
    const route = requestedRoute === '/write/new' ? requestedRoute : '/home';
    await this.security.initialize();
    if (this.security.configured() && !this.security.unlocked()) {
      this.security.continueAfterUnlock(route);
      await this.router.navigateByUrl('/lock');
      return;
    }
    await this.router.navigateByUrl(route);
  }

  private async acceptShare(detail: LifeLeafShareDetail): Promise<void> {
    await this.diary.initialize();
    const entry = createBlankEntry();
    const shared = [detail.text, detail.type.startsWith('image/') ? '' : detail.uri].filter(Boolean).join('\n\n');
    entry.title = detail.type.startsWith('image/') ? 'Shared photo' : 'Shared to Life Leaf';
    entry.plainTextContent = shared;
    if (detail.type.startsWith('image/') && detail.uri) {
      try {
        const response = await fetch(Capacitor.convertFileSrc(detail.uri));
        const blob = await response.blob();
        const extension = detail.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
        await this.attachmentStorage.save(
          entry.id,
          new File([blob], `shared-photo-${Date.now()}.${extension}`, { type: detail.type }),
        );
        entry.attachmentCount = 1;
        entry.photoCount = 1;
      } catch {
        entry.plainTextContent = [entry.plainTextContent, 'A shared photo could not be imported.']
          .filter(Boolean)
          .join('\n\n');
      }
    }
    entry.contentJson = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: entry.plainTextContent ? [{ type: 'text', text: entry.plainTextContent }] : [],
        },
      ],
    });
    await this.diary.saveDraft({ id: entry.id, payload: entry, updatedAt: new Date().toISOString() });
    await this.router.navigate(['/write', 'new']);
  }
}
