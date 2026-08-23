import { Injectable, inject } from '@angular/core';
import { DiaryEntry, DiarySettings, DiaryTag, EntryTemplate, Mood } from '../models/diary.models';
import { AttachmentService, BackupAttachment } from './attachment.service';
import { DiaryService } from './diary.service';

interface BackupData {
  entries: DiaryEntry[];
  moods: Mood[];
  tags: DiaryTag[];
  templates: EntryTemplate[];
  settings: DiarySettings;
  attachments: BackupAttachment[];
}

interface PlainBackup {
  format: 'life-leaf-backup';
  version: 1;
  createdAt: string;
  encrypted: false;
  data: BackupData;
}

interface EncryptedBackup {
  format: 'life-leaf-backup';
  version: 1;
  createdAt: string;
  encrypted: true;
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

type LifeLeafBackup = PlainBackup | EncryptedBackup;

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly diary = inject(DiaryService);
  private readonly attachmentStorage = inject(AttachmentService);

  async export(password?: string): Promise<void> {
    const entries = await this.diary.allEntries();
    const data: BackupData = {
      entries,
      moods: this.diary.moods(),
      tags: this.diary.tags(),
      templates: this.diary.templates(),
      settings: this.diary.settings(),
      attachments: await this.attachmentStorage.exportForEntries(entries.map(entry => entry.id)),
    };
    const createdAt = new Date().toISOString();
    let backup: LifeLeafBackup = { format: 'life-leaf-backup', version: 1, createdAt, encrypted: false, data };
    if (password) backup = await this.encrypt(data, password, createdAt);
    const filename = `life-leaf-backup-${createdAt.slice(0, 10)}.lifeleaf`;
    await this.download(filename, JSON.stringify(backup));
  }

  async restore(contents: string, password: string | undefined, replace: boolean): Promise<number> {
    const parsed = JSON.parse(contents) as Partial<LifeLeafBackup>;
    if (parsed.format !== 'life-leaf-backup' || parsed.version !== 1)
      throw new Error('This is not a supported Life Leaf backup.');
    let data: BackupData;
    if (parsed.encrypted === true) {
      if (!password) throw new Error('This backup needs its password.');
      data = await this.decrypt(parsed as EncryptedBackup, password);
    } else {
      data = (parsed as PlainBackup).data;
    }
    if (!data || !Array.isArray(data.entries)) throw new Error('The backup is incomplete.');
    const safeEntries = data.entries.filter(
      entry => typeof entry.id === 'string' && typeof entry.entryDate === 'string',
    );
    const safetySnapshot = await this.diary.allEntries();
    const safetyAttachments = await this.attachmentStorage.exportForEntries(safetySnapshot.map(entry => entry.id));
    try {
      if (replace) for (const entry of safetySnapshot) await this.attachmentStorage.removeAll(entry.id);
      await this.diary.replaceEntries(safeEntries, replace);
      await this.diary.restoreMetadata(
        data.moods ?? [],
        data.tags ?? [],
        data.templates ?? [],
        data.settings ?? this.diary.settings(),
      );
      await this.attachmentStorage.restoreBackups(Array.isArray(data.attachments) ? data.attachments : []);
    } catch (error) {
      await this.diary.replaceEntries(safetySnapshot, true);
      await this.attachmentStorage.restoreBackups(safetyAttachments);
      throw error;
    }
    return safeEntries.length;
  }

  private async encrypt(data: BackupData, password: string, createdAt: string): Promise<EncryptedBackup> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const iterations = 250_000;
    const key = await this.key(password, salt, iterations, ['encrypt']);
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: this.buffer(iv) }, key, this.buffer(encoded));
    return {
      format: 'life-leaf-backup',
      version: 1,
      createdAt,
      encrypted: true,
      iterations,
      salt: this.base64(salt),
      iv: this.base64(iv),
      ciphertext: this.base64(new Uint8Array(ciphertext)),
    };
  }

  private async decrypt(backup: EncryptedBackup, password: string): Promise<BackupData> {
    try {
      const salt = this.bytes(backup.salt);
      const iv = this.bytes(backup.iv);
      const key = await this.key(password, salt, backup.iterations, ['decrypt']);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: this.buffer(iv) },
        key,
        this.buffer(this.bytes(backup.ciphertext)),
      );
      return JSON.parse(new TextDecoder().decode(decrypted)) as BackupData;
    } catch {
      throw new Error('The password is incorrect or the backup is damaged.');
    }
  }

  private async key(password: string, salt: Uint8Array, iterations: number, usages: KeyUsage[]): Promise<CryptoKey> {
    const source = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
      'deriveKey',
    ]);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: this.buffer(salt), iterations },
      source,
      { name: 'AES-GCM', length: 256 },
      false,
      usages,
    );
  }
  private base64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
  }
  private bytes(value: string): Uint8Array {
    return Uint8Array.from(atob(value), character => character.charCodeAt(0));
  }
  private buffer(value: Uint8Array): ArrayBuffer {
    return new Uint8Array(value).buffer;
  }
  private async download(filename: string, contents: string): Promise<void> {
    if (window.LifeLeafNative?.exportFile) {
      const result = this.nativeResult(
        'export-file',
        () => window.LifeLeafNative?.exportFile(filename, 'application/octet-stream', contents),
        300_000,
      );
      const response = await result;
      if (!response.success) throw new Error(response.message || 'The backup could not be saved.');
      return;
    }
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  private nativeResult(action: string, start: () => void, timeoutMs: number): Promise<LifeLeafNativeResult> {
    return new Promise((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const finish = (result?: LifeLeafNativeResult, error?: Error): void => {
        if (timeout) clearTimeout(timeout);
        window.removeEventListener('life-leaf-native-result', listener);
        if (result) resolve(result);
        else reject(error ?? new Error('The Android request could not be completed.'));
      };
      const listener = (event: Event) => {
        const detail = (event as CustomEvent<LifeLeafNativeResult>).detail;
        if (detail.action !== action) return;
        finish(detail);
      };
      window.addEventListener('life-leaf-native-result', listener);
      timeout = setTimeout(() => finish(undefined, new Error('The Android request timed out.')), timeoutMs);
      try {
        start();
      } catch (error) {
        finish(undefined, error instanceof Error ? error : new Error('The Android request could not be started.'));
      }
    });
  }
}
