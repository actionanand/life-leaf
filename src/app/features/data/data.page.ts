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
  IonInput,
  IonModal,
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
  eyeOffOutline,
  eyeOutline,
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
    IonInput,
    IonModal,
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
  readonly passwordPrompt = signal<{ mode: 'encrypt' | 'restore'; title: string; message: string } | undefined>(
    undefined,
  );
  readonly passwordValue = signal('');
  readonly showPassword = signal(false);
  private passwordResolver?: (value: string | undefined) => void;

  constructor() {
    addIcons({
      archiveOutline,
      cloudDownloadOutline,
      eyeOffOutline,
      eyeOutline,
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
    const password = await this.askPassword({
      mode: 'encrypt',
      title: 'Encrypt backup',
      message: 'Choose a password you will remember. It is never stored by Life Leaf.',
    });
    if (!password || password.length < 8) {
      if (password) await this.snackbar.show('Use at least 8 characters for the backup password');
      return;
    }
    await this.run(() => this.backups.export(password));
  }

  async openRestorePicker(input: HTMLInputElement): Promise<void> {
    input.click();
  }

  async restoreFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await this.restoreContents(await file.text());
  }

  private async restoreContents(contents: string): Promise<void> {
    let password: string | undefined;
    try {
      const metadata = JSON.parse(contents) as { encrypted?: boolean };
      if (metadata.encrypted)
        password = await this.askPassword({
          mode: 'restore',
          title: 'Backup password',
          message: 'Enter the password used when this backup was exported.',
        });
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
    } catch (error) {
      await this.notice(
        'Something went wrong',
        error instanceof Error ? error.message : 'The action could not be completed.',
      );
    } finally {
      this.busy.set(false);
    }
  }
  togglePasswordVisibility(): void {
    this.showPassword.update(value => !value);
  }
  passwordChanged(event: Event): void {
    this.passwordValue.set(String((event as CustomEvent<{ value?: string }>).detail?.value ?? ''));
  }
  closePasswordPrompt(value?: string): void {
    const resolver = this.passwordResolver;
    this.passwordResolver = undefined;
    this.passwordPrompt.set(undefined);
    this.passwordValue.set('');
    this.showPassword.set(false);
    resolver?.(value);
  }
  private askPassword(prompt: {
    mode: 'encrypt' | 'restore';
    title: string;
    message: string;
  }): Promise<string | undefined> {
    this.passwordValue.set('');
    this.showPassword.set(false);
    this.passwordPrompt.set(prompt);
    return new Promise(resolve => {
      this.passwordResolver = resolve;
    });
  }
  private async notice(header: string, message: string): Promise<void> {
    const alert = await this.alerts.create({ header, message, cssClass: 'life-leaf-confirmation', buttons: ['OK'] });
    await alert.present();
  }
  private async toast(message: string): Promise<void> {
    await this.snackbar.show(message);
  }
}
