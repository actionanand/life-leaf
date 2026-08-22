import {
  DiaryEntry,
  DiaryPage,
  DiarySettings,
  DiaryStats,
  DiaryTag,
  EntryDraft,
  EntryQuery,
  EntryTemplate,
  Mood,
} from '../models/diary.models';

export interface DiaryRepository {
  initialize(): Promise<void>;
  entries(query?: EntryQuery): Promise<DiaryPage>;
  entry(id: string): Promise<DiaryEntry | undefined>;
  saveEntry(entry: DiaryEntry): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  saveDraft(draft: EntryDraft): Promise<void>;
  latestDraft(): Promise<EntryDraft | undefined>;
  draft(id: string): Promise<EntryDraft | undefined>;
  deleteDraft(id: string): Promise<void>;
  moods(): Promise<Mood[]>;
  saveMood(mood: Mood): Promise<void>;
  tags(): Promise<DiaryTag[]>;
  saveTag(tag: DiaryTag): Promise<void>;
  templates(): Promise<EntryTemplate[]>;
  saveTemplate(template: EntryTemplate): Promise<void>;
  settings(): Promise<DiarySettings>;
  saveSettings(settings: DiarySettings): Promise<void>;
  stats(): Promise<DiaryStats>;
}
