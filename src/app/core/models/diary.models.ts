export type ThemePreference = 'light' | 'dark' | 'automatic';
export type EntryStatus = 'active' | 'archived' | 'trashed';

export interface DiaryEntry {
  id: string;
  title: string;
  entryDate: string;
  entryTime: string;
  contentJson: string;
  plainTextContent: string;
  moodId?: string;
  tagIds: string[];
  favourite: boolean;
  pinned: boolean;
  status: EntryStatus;
  locationText: string;
  weatherText: string;
  coverAttachmentId?: string;
  attachmentCount: number;
  photoCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface EntryDraft {
  id: string;
  entryId?: string;
  payload: DiaryEntry;
  updatedAt: string;
}

export interface AttachmentMeta {
  id: string;
  entryId: string;
  name: string;
  mimeType: string;
  size: number;
  path: string;
  photo: boolean;
  caption: string;
  createdAt: string;
}

export interface Mood {
  id: string;
  label: string;
  icon: string;
  color: string;
  custom: boolean;
}

export interface DiaryTag {
  id: string;
  name: string;
  color: string;
  archived: boolean;
}

export interface EntryTemplate {
  id: string;
  name: string;
  description: string;
  contentJson: string;
  builtIn: boolean;
}

export interface DiarySettings {
  theme: ThemePreference;
  writingPrompts: boolean;
  showStreak: boolean;
  onThisDay: boolean;
  autosaveSeconds: number;
  weekStartsOnMonday: boolean;
  reminderEnabled: boolean;
  reminderTime: string;
  reminderDays: number[];
  screenshotProtection: boolean;
  revisionLimit: 0 | 5 | 10 | 25;
  trashRetentionDays: 0 | 7 | 30 | 90;
}

export interface EntryQuery {
  text?: string;
  date?: string;
  year?: number;
  month?: number;
  moodId?: string;
  tagId?: string;
  favourite?: boolean;
  pinned?: boolean;
  status?: EntryStatus;
  sort?: 'newest' | 'oldest' | 'edited' | 'title' | 'favourite';
  offset?: number;
  limit?: number;
}

export interface DiaryPage {
  items: DiaryEntry[];
  total: number;
}

export interface DiaryStats {
  entries: number;
  writingDays: number;
  words: number;
  favourites: number;
  photos: number;
}

export const EMPTY_DOC = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });

export function createBlankEntry(date = localDate(), time = localTime()): DiaryEntry {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: '',
    entryDate: date,
    entryTime: time,
    contentJson: EMPTY_DOC,
    plainTextContent: '',
    tagIds: [],
    favourite: false,
    pinned: false,
    status: 'active',
    locationText: '',
    weatherText: '',
    attachmentCount: 0,
    photoCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function localDate(value = new Date()): string {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

export function localTime(value = new Date()): string {
  return value.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
