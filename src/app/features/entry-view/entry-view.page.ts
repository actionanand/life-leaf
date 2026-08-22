import { DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { Editor } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import StarterKit from '@tiptap/starter-kit';
import { addIcons } from 'ionicons';
import {
  attachOutline,
  cameraOutline,
  createOutline,
  heart,
  heartOutline,
  locationOutline,
  timeOutline,
} from 'ionicons/icons';
import { AttachmentMeta, DiaryEntry } from '../../core/models/diary.models';
import { AttachmentService } from '../../core/services/attachment.service';
import { ConfirmationService } from '../../core/services/confirmation.service';
import { DiaryService } from '../../core/services/diary.service';

@Component({
  selector: 'app-entry-view-page',
  templateUrl: './entry-view.page.html',
  styleUrls: ['./entry-view.page.scss'],
  imports: [
    DatePipe,
    DecimalPipe,
    IonBackButton,
    IonButton,
    IonButtons,
    IonChip,
    IonContent,
    IonHeader,
    IonIcon,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class EntryViewPage implements OnDestroy, OnInit {
  readonly id = input.required<string>();
  private readonly diary = inject(DiaryService);
  private readonly attachmentsService = inject(AttachmentService);
  private readonly confirmations = inject(ConfirmationService);
  private readonly router = inject(Router);
  private readonly contentHost = viewChild<ElementRef<HTMLElement>>('contentHost');
  readonly entry = signal<DiaryEntry | undefined>(undefined);
  readonly attachments = signal<AttachmentMeta[]>([]);
  readonly mood = computed(() => {
    const moodId = this.entry()?.moodId;
    return moodId ? this.diary.moodMap().get(moodId) : undefined;
  });
  readonly tags = computed(() =>
    (this.entry()?.tagIds ?? []).map(id => this.diary.tagMap().get(id)).filter(tag => tag !== undefined),
  );
  private contentEditor?: Editor;

  constructor() {
    addIcons({
      attachOutline,
      cameraOutline,
      createOutline,
      heart,
      heartOutline,
      locationOutline,
      timeOutline,
    });
    effect(() => {
      const host = this.contentHost()?.nativeElement;
      const entry = this.entry();
      if (!host || !entry || this.contentEditor) return;
      let content: object;
      try {
        content = JSON.parse(entry.contentJson) as object;
      } catch {
        content = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: entry.plainTextContent }] }],
        };
      }
      this.contentEditor = new Editor({
        element: host,
        editable: false,
        extensions: [
          StarterKit.configure({ link: false, underline: false }),
          Underline,
          Highlight.configure({ multicolor: false }),
          Link.configure({ openOnClick: true, autolink: true }),
          TaskList,
          TaskItem.configure({ nested: true }),
          TextAlign.configure({ types: ['heading', 'paragraph'] }),
        ],
        content,
        editorProps: { attributes: { class: 'life-leaf-readonly', 'aria-label': 'Diary entry content' } },
      });
    });
  }

  async ngOnInit(): Promise<void> {
    await this.diary.initialize();
    const entry = await this.diary.entry(this.id());
    if (!entry) {
      await this.router.navigateByUrl('/home', { replaceUrl: true });
      return;
    }
    this.entry.set(entry);
    this.attachments.set(await this.attachmentsService.list(entry.id));
  }

  ngOnDestroy(): void {
    this.contentEditor?.destroy();
  }

  async edit(): Promise<void> {
    const entry = this.entry();
    if (!entry) return;
    const confirmed = await this.confirmations.confirm({
      header: 'Edit this diary entry?',
      message: 'Editing allows the saved text, date, mood, tags and attachments to be changed.',
      confirmText: 'Continue to edit',
    });
    if (confirmed) await this.router.navigate(['/write', entry.id]);
  }

  async toggleFavourite(): Promise<void> {
    const entry = this.entry();
    if (!entry) return;
    const updated = { ...entry, favourite: !entry.favourite, updatedAt: new Date().toISOString() };
    await this.diary.saveEntry(updated);
    this.entry.set(updated);
  }

  openAttachment(attachment: AttachmentMeta): void {
    void this.attachmentsService.open(attachment);
  }
}
