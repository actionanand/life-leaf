import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
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

interface JsonRow {
  json: string;
}

export class SqliteDiaryRepository implements DiaryRepository {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private connection?: SQLiteDBConnection;

  async initialize(): Promise<void> {
    this.connection = await this.sqlite.createConnection('life_leaf', false, 'no-encryption', 1, false);
    await this.connection.open();
    await this.connection.execute(`
      CREATE TABLE IF NOT EXISTS diary_entries (
        id TEXT PRIMARY KEY NOT NULL, entry_date TEXT NOT NULL, updated_at TEXT NOT NULL,
        status TEXT NOT NULL, favourite INTEGER NOT NULL, pinned INTEGER NOT NULL,
        mood_id TEXT, plain_text TEXT NOT NULL, json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_entries_date ON diary_entries(entry_date);
      CREATE INDEX IF NOT EXISTS idx_entries_updated ON diary_entries(updated_at);
      CREATE INDEX IF NOT EXISTS idx_entries_status ON diary_entries(status);
      CREATE INDEX IF NOT EXISTS idx_entries_favourite ON diary_entries(favourite);
      CREATE INDEX IF NOT EXISTS idx_entries_pinned ON diary_entries(pinned);
      CREATE INDEX IF NOT EXISTS idx_entries_mood ON diary_entries(mood_id);
      CREATE TABLE IF NOT EXISTS entry_tags (
        entry_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY(entry_id, tag_id)
      );
      CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON entry_tags(tag_id);
      CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY NOT NULL, updated_at TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS app_data (kind TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY(kind, id));
      CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL);
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));
    `);
    if ((await this.rows<Mood>('mood')).length === 0) await this.writeRows('mood', DEFAULT_MOODS);
    if ((await this.rows<DiaryTag>('tag')).length === 0) await this.writeRows('tag', DEFAULT_TAGS);
    if ((await this.rows<EntryTemplate>('template')).length === 0) await this.writeRows('template', DEFAULT_TEMPLATES);
    if (!(await this.row<DiarySettings>('settings', 'app'))) await this.writeRow('settings', 'app', DEFAULT_SETTINGS);
  }

  async entries(query: EntryQuery = {}): Promise<DiaryPage> {
    const conditions = ['status = ?'];
    const values: (string | number)[] = [query.status ?? 'active'];
    if (query.date) {
      conditions.push('entry_date = ?');
      values.push(query.date);
    }
    if (query.text?.trim()) {
      conditions.push('plain_text LIKE ?');
      values.push(`%${query.text.trim()}%`);
    }
    if (query.favourite !== undefined) {
      conditions.push('favourite = ?');
      values.push(query.favourite ? 1 : 0);
    }
    if (query.pinned !== undefined) {
      conditions.push('pinned = ?');
      values.push(query.pinned ? 1 : 0);
    }
    if (query.year) {
      conditions.push("strftime('%Y', entry_date) = ?");
      values.push(String(query.year));
    }
    if (query.month) {
      conditions.push("strftime('%m', entry_date) = ?");
      values.push(String(query.month).padStart(2, '0'));
    }
    if (query.moodId) {
      conditions.push('mood_id = ?');
      values.push(query.moodId);
    }
    if (query.tagId) {
      conditions.push('id IN (SELECT entry_id FROM entry_tags WHERE tag_id = ?)');
      values.push(query.tagId);
    }
    const where = conditions.join(' AND ');
    const order =
      query.sort === 'oldest' ? 'entry_date ASC' : query.sort === 'edited' ? 'updated_at DESC' : 'entry_date DESC';
    const totalResult = await this.db().query(`SELECT COUNT(*) AS total FROM diary_entries WHERE ${where}`, values);
    const result = await this.db().query(
      `SELECT json FROM diary_entries WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
      [...values, query.limit ?? 30, query.offset ?? 0],
    );
    const items = (result.values ?? []).map(
      (row: Record<string, unknown>) => JSON.parse(String(row['json'])) as DiaryEntry,
    );
    return { items, total: Number(totalResult.values?.[0]?.['total'] ?? items.length) };
  }

  async entry(id: string): Promise<DiaryEntry | undefined> {
    const result = await this.db().query('SELECT json FROM diary_entries WHERE id = ?', [id]);
    const json = result.values?.[0]?.['json'];
    return json ? (JSON.parse(String(json)) as DiaryEntry) : undefined;
  }

  async saveEntry(entry: DiaryEntry): Promise<void> {
    await this.db().run(
      `INSERT OR REPLACE INTO diary_entries
       (id, entry_date, updated_at, status, favourite, pinned, mood_id, plain_text, json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.entryDate,
        entry.updatedAt,
        entry.status,
        entry.favourite ? 1 : 0,
        entry.pinned ? 1 : 0,
        entry.moodId ?? null,
        `${entry.title} ${entry.plainTextContent} ${entry.locationText}`,
        JSON.stringify(entry),
      ],
    );
    await this.db().run('DELETE FROM entry_tags WHERE entry_id = ?', [entry.id]);
    for (const tagId of entry.tagIds) {
      await this.db().run('INSERT OR IGNORE INTO entry_tags(entry_id, tag_id) VALUES (?, ?)', [entry.id, tagId]);
    }
  }

  async deleteEntry(id: string): Promise<void> {
    await this.db().run('DELETE FROM entry_tags WHERE entry_id = ?', [id]);
    await this.db().run('DELETE FROM diary_entries WHERE id = ?', [id]);
  }
  async saveDraft(draft: EntryDraft): Promise<void> {
    await this.db().run('INSERT OR REPLACE INTO drafts(id, updated_at, json) VALUES (?, ?, ?)', [
      draft.id,
      draft.updatedAt,
      JSON.stringify(draft),
    ]);
  }
  async latestDraft(): Promise<EntryDraft | undefined> {
    const result = await this.db().query('SELECT json FROM drafts ORDER BY updated_at DESC LIMIT 1');
    const json = result.values?.[0]?.['json'];
    return json ? (JSON.parse(String(json)) as EntryDraft) : undefined;
  }
  async draft(id: string): Promise<EntryDraft | undefined> {
    const result = await this.db().query('SELECT json FROM drafts WHERE id = ?', [id]);
    const json = result.values?.[0]?.['json'];
    return json ? (JSON.parse(String(json)) as EntryDraft) : undefined;
  }
  async deleteDraft(id: string): Promise<void> {
    await this.db().run('DELETE FROM drafts WHERE id = ?', [id]);
  }
  moods(): Promise<Mood[]> {
    return this.rows('mood');
  }
  saveMood(mood: Mood): Promise<void> {
    return this.writeRow('mood', mood.id, mood);
  }
  tags(): Promise<DiaryTag[]> {
    return this.rows('tag');
  }
  saveTag(tag: DiaryTag): Promise<void> {
    return this.writeRow('tag', tag.id, tag);
  }
  templates(): Promise<EntryTemplate[]> {
    return this.rows('template');
  }
  saveTemplate(template: EntryTemplate): Promise<void> {
    return this.writeRow('template', template.id, template);
  }
  async settings(): Promise<DiarySettings> {
    return { ...DEFAULT_SETTINGS, ...(await this.row<DiarySettings>('settings', 'app')) };
  }
  saveSettings(settings: DiarySettings): Promise<void> {
    return this.writeRow('settings', 'app', settings);
  }
  async stats(): Promise<DiaryStats> {
    const items = (await this.entries({ limit: 100_000 })).items;
    return {
      entries: items.length,
      writingDays: new Set(items.map(entry => entry.entryDate)).size,
      words: items.reduce((sum, entry) => sum + entry.plainTextContent.trim().split(/\s+/).filter(Boolean).length, 0),
      favourites: items.filter(entry => entry.favourite).length,
      photos: items.reduce((sum, entry) => sum + entry.photoCount, 0),
    };
  }

  private db(): SQLiteDBConnection {
    if (!this.connection) throw new Error('Life Leaf storage is not ready.');
    return this.connection;
  }
  private async rows<T>(kind: string): Promise<T[]> {
    const result = await this.db().query('SELECT json FROM app_data WHERE kind = ?', [kind]);
    return ((result.values as JsonRow[] | undefined) ?? []).map(row => JSON.parse(row.json) as T);
  }
  private async row<T>(kind: string, id: string): Promise<T | undefined> {
    const result = await this.db().query('SELECT json FROM app_data WHERE kind = ? AND id = ?', [kind, id]);
    const json = result.values?.[0]?.['json'];
    return json ? (JSON.parse(String(json)) as T) : undefined;
  }
  private async writeRows<T extends { id: string }>(kind: string, values: T[]): Promise<void> {
    for (const value of values) await this.writeRow(kind, value.id, value);
  }
  private async writeRow<T>(kind: string, id: string, value: T): Promise<void> {
    await this.db().run('INSERT OR REPLACE INTO app_data(kind, id, json) VALUES (?, ?, ?)', [
      kind,
      id,
      JSON.stringify(value),
    ]);
  }
}
