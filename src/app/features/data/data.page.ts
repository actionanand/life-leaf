import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
  SegmentCustomEvent,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  archiveOutline,
  cloudDownloadOutline,
  keyOutline,
  leafOutline,
  refreshOutline,
  shieldCheckmarkOutline,
  trashOutline,
} from 'ionicons/icons';
import { DiaryEntry } from '../../core/models/diary.models';
import { BackupService } from '../../core/services/backup.service';
import { AttachmentService } from '../../core/services/attachment.service';
import { ConfirmationService } from '../../core/services/confirmation.service';
import { DiaryService } from '../../core/services/diary.service';
import { SnackbarService } from '../../core/services/snackbar.service';
import { EntryCardComponent } from '../../shared/entry-card/entry-card.component';

type DataView = 'backup' | 'archive' | 'trash';

@Component({
  selector: 'app-data-page',
  templateUrl: './data.page.html',
  styleUrls: ['./data.page.scss'],
  imports: [
    EntryCardComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonSegment,
    IonSegmentButton,
    IonTitle,
    IonToolbar,
  ],
})
export class DataPage implements OnInit {
  readonly diary = inject(DiaryService);
  private readonly route = inject(ActivatedRoute);
  private readonly backups = inject(BackupService);
  private readonly attachments = inject(AttachmentService);
  private readonly alerts = inject(AlertController);
  private readonly confirmations = inject(ConfirmationService);
  private readonly snackbar = inject(SnackbarService);
  readonly view = signal<DataView>('backup');
  readonly archived = signal<DiaryEntry[]>([]);
  readonly trashed = signal<DiaryEntry[]>([]);
  readonly activeViewEntries = computed(() => (this.view() === 'archive' ? this.archived() : this.trashed()));
  readonly busy = signal(false);

  constructor() {
    addIcons({
      archiveOutline,
      cloudDownloadOutline,
      keyOutline,
      leafOutline,
      refreshOutline,
      shieldCheckmarkOutline,
      trashOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    await this.diary.initialize();
    const requested = this.route.snapshot.queryParamMap.get('view') ?? '';
    if (requested === 'archive' || requested === 'trash') this.view.set(requested);
    await this.refresh();
    if (requested === 'delete') await this.deleteAll();
  }

  changed(event: SegmentCustomEvent): void {
    this.view.set(event.detail.value as DataView);
  }
  async refresh(): Promise<void> {
    const [archived, trashed] = await Promise.all([
      this.diary.query({ status: 'archived', limit: 10_000 }),
      this.diary.query({ status: 'trashed', limit: 10_000 }),
    ]);
    this.archived.set(archived);
    this.trashed.set(trashed);
  }

  async exportPlain(): Promise<void> {
    const confirmed = await this.confirmations.confirm({
      header: 'Export an unencrypted backup?',
      message: 'This file may contain private diary information. Keep it somewhere safe.',
      confirmText: 'Export backup',
    });
    if (!confirmed) return;
    await this.run(() => this.backups.export());
  }

  async exportEncrypted(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Encrypt backup',
      message: 'Choose a password you will remember. It is never stored by Life Leaf.',
      cssClass: 'life-leaf-confirmation',
      inputs: [
        {
          name: 'password',
          type: 'password',
          placeholder: 'Backup password',
          attributes: { minlength: 8, autocomplete: 'new-password' },
        },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Export', role: 'confirm' },
      ],
    });
    await alert.present();
    const result = await alert.onDidDismiss<{ values?: { password?: string } }>();
    const password = result.data?.values?.password;
    if (result.role !== 'confirm' || !password || password.length < 8) return;
    await this.run(() => this.backups.export(password));
  }

  async restoreFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    let password: string | undefined;
    const contents = await file.text();
    try {
      const metadata = JSON.parse(contents) as { encrypted?: boolean };
      if (metadata.encrypted) password = await this.askPassword();
      if (metadata.encrypted && !password) return;
      const modeAlert = await this.alerts.create({
        header: 'Restore this backup?',
        message:
          'Merge keeps existing entries. Replace first removes the current diary. A temporary safety snapshot is used if restore fails.',
        cssClass: 'life-leaf-confirmation',
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          { text: 'Merge', role: 'merge' },
          { text: 'Replace', role: 'replace' },
        ],
      });
      await modeAlert.present();
      const mode = (await modeAlert.onDidDismiss()).role;
      if (mode !== 'merge' && mode !== 'replace') return;
      await this.run(async () => {
        const count = await this.backups.restore(contents, password, mode === 'replace');
        await this.toast(`${count} entries restored`);
      });
    } catch (error) {
      await this.notice(
        'Restore failed',
        error instanceof Error ? error.message : 'The selected file could not be restored.',
      );
    }
  }

  async restoreEntry(entry: DiaryEntry): Promise<void> {
    await this.diary.restore(entry);
    await this.refresh();
    await this.snackbar.show('Entry restored');
  }
  async permanentDelete(entry: DiaryEntry): Promise<void> {
    if (
      await this.confirmations.confirm({
        header: 'Delete permanently?',
        message: 'This page and its private attachment files cannot be recovered after deletion.',
        confirmText: 'Delete',
        destructive: true,
      })
    ) {
      await this.attachments.removeAll(entry.id);
      await this.diary.deletePermanently(entry.id);
      await this.refresh();
      await this.snackbar.show('Entry permanently deleted');
    }
  }

  async deleteAll(): Promise<void> {
    if (
      !(await this.confirmations.confirm({
        header: 'Delete all diary data?',
        message: 'Every entry, archive and trashed page will be permanently removed from this device.',
        confirmText: 'Continue',
        destructive: true,
      }))
    )
      return;
    const alert = await this.alerts.create({
      header: 'Final confirmation',
      message: 'Type DELETE to confirm. This cannot be undone.',
      cssClass: 'life-leaf-confirmation',
      inputs: [{ name: 'confirmation', type: 'text', placeholder: 'DELETE' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete everything', role: 'destructive' },
      ],
    });
    await alert.present();
    const result = await alert.onDidDismiss<{ values?: { confirmation?: string } }>();
    if (result.role !== 'destructive' || result.data?.values?.confirmation !== 'DELETE') return;
    await this.run(async () => {
      for (const entry of await this.diary.allEntries()) await this.attachments.removeAll(entry.id);
      await this.diary.replaceEntries([], true);
      await this.refresh();
      await this.toast('Diary data deleted');
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } finally {
      this.busy.set(false);
    }
  }
  private async askPassword(): Promise<string | undefined> {
    const alert = await this.alerts.create({
      header: 'Backup password',
      cssClass: 'life-leaf-confirmation',
      inputs: [{ name: 'password', type: 'password', placeholder: 'Password' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Continue', role: 'confirm' },
      ],
    });
    await alert.present();
    const result = await alert.onDidDismiss<{ values?: { password?: string } }>();
    return result.role === 'confirm' ? result.data?.values?.password : undefined;
  }
  private async notice(header: string, message: string): Promise<void> {
    const alert = await this.alerts.create({ header, message, cssClass: 'life-leaf-confirmation', buttons: ['OK'] });
    await alert.present();
  }
  private async toast(message: string): Promise<void> {
    await this.snackbar.show(message);
  }
}
