import { DecimalPipe, Location } from '@angular/common';
import { Component, DestroyRef, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { PluginListenerHandle } from '@capacitor/core';
import { Haptics, NotificationType } from '@capacitor/haptics';
import {
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonDatetime,
  IonDatetimeButton,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  archiveOutline,
  arrowBackOutline,
  attachOutline,
  bookmarkOutline,
  cameraOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  heart,
  heartOutline,
  locationOutline,
  timeOutline,
  trashOutline,
} from 'ionicons/icons';
import { debounceTime } from 'rxjs';
import { AttachmentMeta, DiaryEntry, EMPTY_DOC, createBlankEntry, localDate } from '../../core/models/diary.models';
import { AttachmentService } from '../../core/services/attachment.service';
import { ConfirmationService } from '../../core/services/confirmation.service';
import { DiaryService } from '../../core/services/diary.service';
import { SnackbarService } from '../../core/services/snackbar.service';
import { RichEditorComponent } from '../../shared/rich-editor/rich-editor.component';

@Component({
  selector: 'app-editor-page',
  templateUrl: './editor.page.html',
  styleUrls: ['./editor.page.scss'],
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    RichEditorComponent,
    IonButton,
    IonButtons,
    IonChip,
    IonContent,
    IonDatetime,
    IonDatetimeButton,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonModal,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class EditorPage implements OnDestroy, OnInit {
  readonly id = input.required<string>();
  readonly date = input<string>();
  readonly diary = inject(DiaryService);
  private readonly attachmentStorage = inject(AttachmentService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly confirmations = inject(ConfirmationService);
  private readonly snackbar = inject(SnackbarService);
  private readonly modals = inject(ModalController);
  private readonly destroyRef = inject(DestroyRef);
  readonly loaded = signal(false);
  readonly saving = signal(false);
  readonly saved = signal(true);
  readonly entry = signal<DiaryEntry | undefined>(undefined);
  readonly wordCount = signal(0);
  readonly attachments = signal<AttachmentMeta[]>([]);
  readonly selectedMood = computed(() => this.form.controls.moodId.value);
  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true }),
    entryDate: new FormControl(localDate(), { nonNullable: true }),
    entryTime: new FormControl('', { nonNullable: true }),
    contentJson: new FormControl(EMPTY_DOC, { nonNullable: true }),
    plainTextContent: new FormControl('', { nonNullable: true }),
    moodId: new FormControl('', { nonNullable: true }),
    locationText: new FormControl('', { nonNullable: true }),
    weatherText: new FormControl('', { nonNullable: true }),
  });
  private backListener?: PluginListenerHandle;
  private stateListener?: PluginListenerHandle;
  private pendingAutosave = Promise.resolve();
  private discarding = false;
  private leavePromptOpen = false;
  private attachmentIdsAtOpen = new Set<string>();
  private readonly pendingAttachmentRemovals = new Map<string, AttachmentMeta>();

  constructor() {
    addIcons({
      archiveOutline,
      arrowBackOutline,
      attachOutline,
      bookmarkOutline,
      cameraOutline,
      checkmarkCircleOutline,
      closeCircleOutline,
      heart,
      heartOutline,
      locationOutline,
      timeOutline,
      trashOutline,
    });
    this.form.valueChanges
      .pipe(debounceTime(2_000), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.queueAutosave());
  }

  async ngOnInit(): Promise<void> {
    await this.diary.initialize();
    const existing = this.id() === 'new' ? undefined : await this.diary.entry(this.id());
    const draft = this.id() === 'new' ? await this.diary.latestDraft() : await this.diary.draft(this.id());
    const useDraft = draft && (!existing || draft.updatedAt > existing.updatedAt);
    const entry = (useDraft ? draft.payload : existing) ?? createBlankEntry(this.date() ?? localDate());
    this.entry.set(entry);
    const attachments = await this.attachmentStorage.list(entry.id);
    this.attachments.set(attachments);
    this.attachmentIdsAtOpen = new Set(attachments.map(attachment => attachment.id));
    this.form.reset({
      title: entry.title,
      entryDate: entry.entryDate,
      entryTime: entry.entryTime,
      contentJson: entry.contentJson,
      plainTextContent: entry.plainTextContent,
      moodId: entry.moodId ?? '',
      locationText: entry.locationText,
      weatherText: entry.weatherText,
    });
    this.wordCount.set(this.words(entry.plainTextContent));
    this.form.markAsPristine();
    this.loaded.set(true);
    if (useDraft) {
      await this.snackbar.show('Unfinished draft restored');
    }
    this.backListener = await App.addListener('backButton', async () => {
      const modal = await this.modals.getTop();
      if (modal) await modal.dismiss();
      else await this.back();
    });
    this.stateListener = await App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) this.queueAutosave();
    });
  }

  ngOnDestroy(): void {
    void this.backListener?.remove();
    void this.stateListener?.remove();
  }

  editorChanged(value: { json: string; text: string }): void {
    this.form.patchValue({ contentJson: value.json, plainTextContent: value.text });
    this.wordCount.set(this.words(value.text));
    this.saved.set(false);
  }

  chooseMood(id: string): void {
    this.form.controls.moodId.setValue(this.selectedMood() === id ? '' : id);
  }

  useTemplate(contentJson: string): void {
    this.form.controls.contentJson.setValue(contentJson);
    this.entry.update(entry => (entry ? { ...entry, contentJson } : entry));
  }

  toggleFavourite(): void {
    this.entry.update(entry => (entry ? { ...entry, favourite: !entry.favourite } : entry));
    this.form.markAsDirty();
  }

  togglePinned(): void {
    this.entry.update(entry => (entry ? { ...entry, pinned: !entry.pinned } : entry));
    this.form.markAsDirty();
  }

  toggleTag(id: string): void {
    this.entry.update(entry => {
      if (!entry) return entry;
      const tagIds = entry.tagIds.includes(id) ? entry.tagIds.filter(tagId => tagId !== id) : [...entry.tagIds, id];
      return { ...entry, tagIds };
    });
    this.form.markAsDirty();
  }

  async addFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    const current = this.entry();
    if (!current || !files.length) return;
    this.saving.set(true);
    try {
      for (const file of files) {
        const attachment = await this.attachmentStorage.save(current.id, file);
        this.attachments.update(items => [...items, attachment]);
      }
      this.syncAttachmentCounts();
      this.form.markAsDirty();
    } finally {
      this.saving.set(false);
    }
  }

  async removeAttachment(attachment: AttachmentMeta): Promise<void> {
    const confirmed = await this.confirmations.confirm({
      header: 'Remove attachment?',
      message: 'This attachment will be removed from the entry and cannot be recovered.',
      confirmText: 'Remove',
      destructive: true,
    });
    if (!confirmed) return;
    if (this.attachmentIdsAtOpen.has(attachment.id)) this.pendingAttachmentRemovals.set(attachment.id, attachment);
    else await this.attachmentStorage.remove(attachment);
    this.attachments.update(items => items.filter(item => item.id !== attachment.id));
    this.syncAttachmentCounts();
    this.form.markAsDirty();
  }

  openAttachment(attachment: AttachmentMeta): void {
    void this.attachmentStorage.open(attachment);
  }

  async save(): Promise<void> {
    const entry = this.buildEntry();
    if (!entry) return;
    this.saving.set(true);
    try {
      for (const attachment of this.pendingAttachmentRemovals.values()) {
        await this.attachmentStorage.remove(attachment);
      }
      this.pendingAttachmentRemovals.clear();
      await this.diary.saveEntry(entry);
      await this.diary.deleteDraft(entry.id);
      this.entry.set(entry);
      this.form.markAsPristine();
      this.saved.set(true);
      await Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
      await this.snackbar.show('Entry saved', { icon: 'checkmark-circle-outline' });
      await this.router.navigate(['/entry', entry.id], { replaceUrl: true });
    } finally {
      this.saving.set(false);
    }
  }

  async back(): Promise<void> {
    if (await this.canLeaveEditor(true)) {
      this.location.back();
    }
  }

  async trash(): Promise<void> {
    const current = this.entry();
    if (!current || this.id() === 'new') return;
    const confirmed = await this.confirmations.confirm({
      header: 'Move entry to Trash?',
      message: 'You can restore it later from Settings.',
      confirmText: 'Move to Trash',
      destructive: true,
    });
    if (!confirmed) return;
    await this.diary.moveToTrash(current);
    await this.snackbar.show('Entry moved to Trash');
    await this.router.navigateByUrl('/home');
  }

  async archive(): Promise<void> {
    const current = this.buildEntry();
    if (!current || this.id() === 'new') return;
    const confirmed = await this.confirmations.confirm({
      header: 'Archive this entry?',
      message: 'Archived entries remain available from Settings and can be restored later.',
      confirmText: 'Archive',
    });
    if (!confirmed) return;
    await this.diary.archive(current);
    await this.snackbar.show('Entry archived');
    await this.router.navigateByUrl('/home');
  }

  private async autosave(): Promise<void> {
    if (this.discarding || !this.loaded() || !this.form.dirty) return;
    const payload = this.buildEntry();
    if (!payload) return;
    this.saving.set(true);
    this.saved.set(false);
    try {
      await this.diary.saveDraft({
        id: payload.id,
        entryId: this.id() === 'new' ? undefined : payload.id,
        payload,
        updatedAt: new Date().toISOString(),
      });
      this.saved.set(true);
    } finally {
      this.saving.set(false);
    }
  }

  private queueAutosave(): void {
    this.pendingAutosave = this.pendingAutosave.then(() => this.autosave()).catch(() => undefined);
  }

  async canLeaveEditor(forcePrompt = false): Promise<boolean> {
    if ((!forcePrompt && !this.form.dirty) || this.discarding) return true;
    if (!this.loaded()) return true;
    if (this.leavePromptOpen) return false;
    this.leavePromptOpen = true;
    try {
      const discard = await this.confirmations.confirm({
        header: 'Discard changes?',
        message: this.form.dirty
          ? 'Your latest edits on this page will be removed.'
          : 'Leave this page and return to your diary?',
        confirmText: 'Discard',
        cancelText: 'Keep editing',
        destructive: true,
      });
      if (!discard) return false;
      if (this.form.dirty) await this.discardChanges();
      return true;
    } finally {
      this.leavePromptOpen = false;
    }
  }

  private async discardChanges(): Promise<void> {
    this.discarding = true;
    await this.pendingAutosave;
    const current = this.entry();
    if (current) {
      for (const attachment of this.attachments()) {
        if (!this.attachmentIdsAtOpen.has(attachment.id)) await this.attachmentStorage.remove(attachment);
      }
      await this.diary.deleteDraft(current.id);
    }
    this.form.markAsPristine();
  }

  private buildEntry(): DiaryEntry | undefined {
    const current = this.entry();
    if (!current) return undefined;
    const value = this.form.getRawValue();
    return { ...current, ...value, moodId: value.moodId || undefined, updatedAt: new Date().toISOString() };
  }

  private words(value: string): number {
    return value.trim().split(/\s+/).filter(Boolean).length;
  }
  private syncAttachmentCounts(): void {
    this.entry.update(entry =>
      entry
        ? {
            ...entry,
            attachmentCount: this.attachments().length,
            photoCount: this.attachments().filter(item => item.photo).length,
          }
        : entry,
    );
  }
}
