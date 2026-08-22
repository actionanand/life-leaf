import { DEFAULT_MOODS, DEFAULT_SETTINGS, DEFAULT_TAGS, DEFAULT_TEMPLATES } from '../data/defaults';
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
import { DiaryRepository } from './diary-repository';

type StoreName = 'entries' | 'drafts' | 'moods' | 'tags' | 'templates' | 'settings';

export class IndexedDbDiaryRepository implements DiaryRepository {
  private database?: IDBDatabase;

  async initialize(): Promise<void> {
    this.database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('life-leaf', 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const db = request.result;
        const entries = db.createObjectStore('entries', { keyPath: 'id' });
        entries.createIndex('entryDate', 'entryDate');
        entries.createIndex('updatedAt', 'updatedAt');
        entries.createIndex('status', 'status');
        entries.createIndex('favourite', 'favourite');
        entries.createIndex('pinned', 'pinned');
        db.createObjectStore('drafts', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
        db.createObjectStore('moods', { keyPath: 'id' });
        db.createObjectStore('tags', { keyPath: 'id' });
        db.createObjectStore('templates', { keyPath: 'id' });
        db.createObjectStore('settings', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
    });
    if ((await this.all<Mood>('moods')).length === 0) await this.putMany('moods', DEFAULT_MOODS);
    if ((await this.all<DiaryTag>('tags')).length === 0) await this.putMany('tags', DEFAULT_TAGS);
    if ((await this.all<EntryTemplate>('templates')).length === 0) {
      await this.putMany('templates', DEFAULT_TEMPLATES);
    }
    if (!(await this.get<{ key: string; value: DiarySettings }>('settings', 'app'))) {
      await this.put('settings', { key: 'app', value: DEFAULT_SETTINGS });
    }
  }

  async entries(query: EntryQuery = {}): Promise<DiaryPage> {
    const normalized = query.text?.trim().toLocaleLowerCase();
    const status = query.status ?? 'active';
    const all = (await this.all<DiaryEntry>('entries')).filter(entry => {
      const date = new Date(`${entry.entryDate}T00:00:00`);
      const haystack =
        `${entry.title} ${entry.plainTextContent} ${entry.locationText} ${entry.entryDate}`.toLocaleLowerCase();
      return (
        entry.status === status &&
        (!normalized || haystack.includes(normalized)) &&
        (!query.date || entry.entryDate === query.date) &&
        (!query.year || date.getFullYear() === query.year) &&
        (!query.month || date.getMonth() + 1 === query.month) &&
        (!query.moodId || entry.moodId === query.moodId) &&
        (!query.tagId || entry.tagIds.includes(query.tagId)) &&
        (query.favourite === undefined || entry.favourite === query.favourite) &&
        (query.pinned === undefined || entry.pinned === query.pinned)
      );
    });
    const sort = query.sort ?? 'newest';
    all.sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title);
      if (sort === 'edited') return b.updatedAt.localeCompare(a.updatedAt);
      if (sort === 'favourite')
        return Number(b.favourite) - Number(a.favourite) || b.entryDate.localeCompare(a.entryDate);
      const direction = sort === 'oldest' ? 1 : -1;
      return direction * `${a.entryDate}T${a.entryTime}`.localeCompare(`${b.entryDate}T${b.entryTime}`);
    });
    const offset = query.offset ?? 0;
    return { items: all.slice(offset, offset + (query.limit ?? 30)), total: all.length };
  }

  entry(id: string): Promise<DiaryEntry | undefined> {
    return this.get('entries', id);
  }

  saveEntry(entry: DiaryEntry): Promise<void> {
    return this.put('entries', entry);
  }

  deleteEntry(id: string): Promise<void> {
    return this.remove('entries', id);
  }

  saveDraft(draft: EntryDraft): Promise<void> {
    return this.put('drafts', draft);
  }

  async latestDraft(): Promise<EntryDraft | undefined> {
    return (await this.all<EntryDraft>('drafts')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  }
  draft(id: string): Promise<EntryDraft | undefined> {
    return this.get('drafts', id);
  }

  deleteDraft(id: string): Promise<void> {
    return this.remove('drafts', id);
  }

  moods(): Promise<Mood[]> {
    return this.all('moods');
  }
  saveMood(mood: Mood): Promise<void> {
    return this.put('moods', mood);
  }

  tags(): Promise<DiaryTag[]> {
    return this.all('tags');
  }
  saveTag(tag: DiaryTag): Promise<void> {
    return this.put('tags', tag);
  }

  templates(): Promise<EntryTemplate[]> {
    return this.all('templates');
  }
  saveTemplate(template: EntryTemplate): Promise<void> {
    return this.put('templates', template);
  }

  async settings(): Promise<DiarySettings> {
    const stored = (await this.get<{ key: string; value: DiarySettings }>('settings', 'app'))?.value;
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  saveSettings(value: DiarySettings): Promise<void> {
    return this.put('settings', { key: 'app', value });
  }

  async stats(): Promise<DiaryStats> {
    const entries = (await this.entries({ limit: 100_000 })).items;
    return {
      entries: entries.length,
      writingDays: new Set(entries.map(entry => entry.entryDate)).size,
      words: entries.reduce((sum, entry) => sum + entry.plainTextContent.trim().split(/\s+/).filter(Boolean).length, 0),
      favourites: entries.filter(entry => entry.favourite).length,
      photos: entries.reduce((sum, entry) => sum + entry.photoCount, 0),
    };
  }

  private store(name: StoreName, mode: IDBTransactionMode): IDBObjectStore {
    if (!this.database) throw new Error('Life Leaf storage is not ready.');
    return this.database.transaction(name, mode).objectStore(name);
  }

  private all<T>(name: StoreName): Promise<T[]> {
    return this.request(this.store(name, 'readonly').getAll());
  }

  private get<T>(name: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return this.request(this.store(name, 'readonly').get(key));
  }

  private async put<T>(name: StoreName, value: T): Promise<void> {
    await this.request(this.store(name, 'readwrite').put(value));
  }

  private async putMany<T>(name: StoreName, values: T[]): Promise<void> {
    await Promise.all(values.map(value => this.put(name, value)));
  }

  private async remove(name: StoreName, key: IDBValidKey): Promise<void> {
    await this.request(this.store(name, 'readwrite').delete(key));
  }

  private request<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
