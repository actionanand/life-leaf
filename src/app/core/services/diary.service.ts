import { Injectable, computed, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { DEFAULT_SETTINGS } from '../data/defaults';
import {
  DiaryEntry,
  DiarySettings,
  DiaryStats,
  DiaryTag,
  EntryDraft,
  EntryQuery,
  EntryTemplate,
  Mood,
} from '../models/diary.models';
import { DiaryRepository } from '../repositories/diary-repository';
import { IndexedDbDiaryRepository } from '../repositories/indexed-db.repository';
import { SqliteDiaryRepository } from '../repositories/sqlite.repository';

@Injectable({ providedIn: 'root' })
export class DiaryService {
  private readonly preferredColourScheme = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly repository: DiaryRepository = Capacitor.isNativePlatform()
    ? new SqliteDiaryRepository()
    : new IndexedDbDiaryRepository();
  readonly ready = signal(false);
  readonly loading = signal(false);
  readonly entries = signal<DiaryEntry[]>([]);
  readonly total = signal(0);
  readonly moods = signal<Mood[]>([]);
  readonly tags = signal<DiaryTag[]>([]);
  readonly templates = signal<EntryTemplate[]>([]);
  readonly settings = signal<DiarySettings>(DEFAULT_SETTINGS);
  readonly stats = signal<DiaryStats>({ entries: 0, writingDays: 0, words: 0, favourites: 0, photos: 0 });
  readonly moodMap = computed(() => new Map(this.moods().map(mood => [mood.id, mood])));
  readonly tagMap = computed(() => new Map(this.tags().map(tag => [tag.id, tag])));

  constructor() {
    this.preferredColourScheme.addEventListener('change', () => {
      if (this.settings().theme === 'automatic') this.applyTheme('automatic');
    });
  }

  async initialize(): Promise<void> {
    if (this.ready()) return;
    await this.repository.initialize();
    const [moods, tags, templates, settings] = await Promise.all([
      this.repository.moods(),
      this.repository.tags(),
      this.repository.templates(),
      this.repository.settings(),
    ]);
    this.moods.set(moods);
    this.tags.set(tags);
    this.templates.set(templates);
    this.settings.set(settings);
    this.applyTheme(settings.theme);
    window.LifeLeafNative?.setScreenshotProtection(settings.screenshotProtection);
    this.ready.set(true);
    await this.refresh();
  }

  async refresh(query: EntryQuery = {}): Promise<void> {
    this.loading.set(true);
    try {
      const [page, stats] = await Promise.all([this.repository.entries(query), this.repository.stats()]);
      this.entries.set(page.items);
      this.total.set(page.total);
      this.stats.set(stats);
    } finally {
      this.loading.set(false);
    }
  }

  entry(id: string): Promise<DiaryEntry | undefined> {
    return this.repository.entry(id);
  }
  async saveEntry(entry: DiaryEntry): Promise<void> {
    await this.repository.saveEntry(entry);
    await this.refresh();
  }
  async moveToTrash(entry: DiaryEntry): Promise<void> {
    await this.saveEntry({
      ...entry,
      status: 'trashed',
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  async toggleFavourite(entry: DiaryEntry): Promise<void> {
    await this.saveEntry({ ...entry, favourite: !entry.favourite, updatedAt: new Date().toISOString() });
  }
  saveDraft(draft: EntryDraft): Promise<void> {
    return this.repository.saveDraft(draft);
  }
  latestDraft(): Promise<EntryDraft | undefined> {
    return this.repository.latestDraft();
  }
  draft(id: string): Promise<EntryDraft | undefined> {
    return this.repository.draft(id);
  }
  deleteDraft(id: string): Promise<void> {
    return this.repository.deleteDraft(id);
  }
  async updateSettings(value: DiarySettings): Promise<void> {
    this.settings.set(value);
    this.applyTheme(value.theme);
    await this.repository.saveSettings(value);
  }
  async query(query: EntryQuery): Promise<DiaryEntry[]> {
    return (await this.repository.entries(query)).items;
  }
  async allEntries(): Promise<DiaryEntry[]> {
    const groups = await Promise.all(
      (['active', 'archived', 'trashed'] as const).map(status => this.query({ status, limit: 100_000 })),
    );
    return groups.flat();
  }
  async archive(entry: DiaryEntry): Promise<void> {
    await this.saveEntry({ ...entry, status: 'archived', updatedAt: new Date().toISOString() });
  }
  async restore(entry: DiaryEntry): Promise<void> {
    await this.saveEntry({ ...entry, status: 'active', deletedAt: undefined, updatedAt: new Date().toISOString() });
  }
  async deletePermanently(id: string): Promise<void> {
    await this.repository.deleteEntry(id);
    await this.refresh();
  }
  async replaceEntries(entries: DiaryEntry[], replace: boolean): Promise<void> {
    if (replace) for (const entry of await this.allEntries()) await this.repository.deleteEntry(entry.id);
    for (const entry of entries) await this.repository.saveEntry(entry);
    await this.refresh();
  }
  async restoreMetadata(
    moods: Mood[],
    tags: DiaryTag[],
    templates: EntryTemplate[],
    settings: DiarySettings,
  ): Promise<void> {
    for (const mood of moods) await this.repository.saveMood(mood);
    for (const tag of tags) await this.repository.saveTag(tag);
    for (const template of templates) await this.repository.saveTemplate(template);
    await this.repository.saveSettings(settings);
    this.moods.set(await this.repository.moods());
    this.tags.set(await this.repository.tags());
    this.templates.set(await this.repository.templates());
    this.settings.set(settings);
    this.applyTheme(settings.theme);
  }

  private applyTheme(theme: DiarySettings['theme']): void {
    const dark = theme === 'dark' || (theme === 'automatic' && this.preferredColourScheme.matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('light', !dark);
    document.documentElement.classList.toggle('ion-palette-dark', dark);
    document.documentElement.dataset['theme'] = theme;
    window.LifeLeafNative?.setDarkMode(dark);
  }
}
