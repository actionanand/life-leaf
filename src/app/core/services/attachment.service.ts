import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { AttachmentMeta } from '../models/diary.models';

interface BrowserAttachment extends AttachmentMeta {
  blob: Blob;
}

export interface BackupAttachment {
  meta: AttachmentMeta;
  data: string;
}

@Injectable({ providedIn: 'root' })
export class AttachmentService {
  private database?: IDBDatabase;

  async list(entryId: string): Promise<AttachmentMeta[]> {
    if (Capacitor.isNativePlatform()) return this.nativeIndex(entryId);
    const database = await this.browserDatabase();
    const records = await this.request<BrowserAttachment[]>(
      database.transaction('attachments').objectStore('attachments').index('entryId').getAll(entryId),
    );
    return records.map(({ blob: _blob, ...meta }) => meta);
  }

  async save(entryId: string, file: File): Promise<AttachmentMeta> {
    const id = crypto.randomUUID();
    const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '-');
    const meta: AttachmentMeta = {
      id,
      entryId,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      path: `${entryId}/${id}-${safeName}`,
      photo: file.type.startsWith('image/'),
      caption: '',
      createdAt: new Date().toISOString(),
    };
    if (Capacitor.isNativePlatform()) {
      await Filesystem.writeFile({
        path: `attachments/${meta.path}`,
        directory: Directory.Data,
        data: await this.base64(file),
        recursive: true,
      });
      await this.writeNativeIndex(entryId, [...(await this.nativeIndex(entryId)), meta]);
    } else {
      const database = await this.browserDatabase();
      await this.request(
        database
          .transaction('attachments', 'readwrite')
          .objectStore('attachments')
          .put({ ...meta, blob: file }),
      );
    }
    return meta;
  }

  async remove(meta: AttachmentMeta): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await Filesystem.deleteFile({ path: `attachments/${meta.path}`, directory: Directory.Data });
      await this.writeNativeIndex(
        meta.entryId,
        (await this.nativeIndex(meta.entryId)).filter(item => item.id !== meta.id),
      );
    } else {
      const database = await this.browserDatabase();
      await this.request(database.transaction('attachments', 'readwrite').objectStore('attachments').delete(meta.id));
    }
  }

  async removeAll(entryId: string): Promise<void> {
    for (const attachment of await this.list(entryId)) await this.remove(attachment);
    if (Capacitor.isNativePlatform()) {
      try {
        await Filesystem.rmdir({ path: `attachments/${entryId}`, directory: Directory.Data, recursive: true });
      } catch {
        /* Already empty or absent. */
      }
    }
  }

  async open(meta: AttachmentMeta): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const result = await Filesystem.getUri({ path: `attachments/${meta.path}`, directory: Directory.Data });
      window.open(Capacitor.convertFileSrc(result.uri), '_blank', 'noopener');
      return;
    }
    const database = await this.browserDatabase();
    const record = await this.request<BrowserAttachment | undefined>(
      database.transaction('attachments').objectStore('attachments').get(meta.id),
    );
    if (!record) return;
    const url = URL.createObjectURL(record.blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async exportForEntries(entryIds: string[]): Promise<BackupAttachment[]> {
    const attachments = (await Promise.all(entryIds.map(entryId => this.list(entryId)))).flat();
    const output: BackupAttachment[] = [];
    for (const meta of attachments) {
      if (Capacitor.isNativePlatform()) {
        const file = await Filesystem.readFile({ path: `attachments/${meta.path}`, directory: Directory.Data });
        output.push({ meta, data: String(file.data) });
      } else {
        const database = await this.browserDatabase();
        const record = await this.request<BrowserAttachment | undefined>(
          database.transaction('attachments').objectStore('attachments').get(meta.id),
        );
        if (record) output.push({ meta, data: await this.base64(record.blob) });
      }
    }
    return output;
  }

  async restoreBackups(records: BackupAttachment[]): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const byEntry = new Map<string, AttachmentMeta[]>();
      for (const record of records) {
        await Filesystem.writeFile({
          path: `attachments/${record.meta.path}`,
          directory: Directory.Data,
          data: record.data,
          recursive: true,
        });
        byEntry.set(record.meta.entryId, [...(byEntry.get(record.meta.entryId) ?? []), record.meta]);
      }
      for (const [entryId, items] of byEntry) {
        const combined = new Map((await this.nativeIndex(entryId)).map(item => [item.id, item]));
        for (const item of items) combined.set(item.id, item);
        await this.writeNativeIndex(entryId, [...combined.values()]);
      }
      return;
    }
    const database = await this.browserDatabase();
    for (const record of records) {
      const bytes = Uint8Array.from(atob(record.data), character => character.charCodeAt(0));
      const blob = new Blob([new Uint8Array(bytes).buffer], { type: record.meta.mimeType });
      await this.request(
        database
          .transaction('attachments', 'readwrite')
          .objectStore('attachments')
          .put({ ...record.meta, blob }),
      );
    }
  }

  private async nativeIndex(entryId: string): Promise<AttachmentMeta[]> {
    try {
      const file = await Filesystem.readFile({
        path: `attachments/${entryId}/index.json`,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      return JSON.parse(String(file.data)) as AttachmentMeta[];
    } catch {
      return [];
    }
  }
  private async writeNativeIndex(entryId: string, items: AttachmentMeta[]): Promise<void> {
    await Filesystem.writeFile({
      path: `attachments/${entryId}/index.json`,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      data: JSON.stringify(items),
      recursive: true,
    });
  }
  private base64(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.readAsDataURL(file);
    });
  }
  private async browserDatabase(): Promise<IDBDatabase> {
    if (this.database) return this.database;
    this.database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('life-leaf-attachments', 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('attachments', { keyPath: 'id' });
        store.createIndex('entryId', 'entryId');
      };
      request.onsuccess = () => resolve(request.result);
    });
    return this.database;
  }
  private request<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
