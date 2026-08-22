import { Injectable, signal } from '@angular/core';

interface LockRecord {
  key: 'lock';
  enabled: boolean;
  salt: string;
  verifier: string;
  biometric: boolean;
}

@Injectable({ providedIn: 'root' })
export class SecurityService {
  readonly configured = signal(false);
  readonly unlocked = signal(true);
  readonly biometricEnabled = signal(false);
  readonly biometricAvailable = signal(false);
  private database?: IDBDatabase;
  private record?: LockRecord;
  private routeAfterUnlock?: string;

  async initialize(): Promise<void> {
    if (this.database) return;
    this.database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('life-leaf-security', 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => request.result.createObjectStore('security', { keyPath: 'key' });
      request.onsuccess = () => resolve(request.result);
    });
    this.record = await this.get();
    this.configured.set(this.record?.enabled ?? false);
    this.biometricEnabled.set(this.record?.biometric ?? false);
    this.biometricAvailable.set(window.LifeLeafNative?.isBiometricAvailable?.() ?? false);
    this.unlocked.set(!this.configured());
  }

  async setPin(pin: string): Promise<void> {
    if (!/^\d{4,8}$/.test(pin)) throw new Error('Use a PIN with 4 to 8 digits.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    window.LifeLeafNative?.disableBiometric?.();
    const record: LockRecord = {
      key: 'lock',
      enabled: true,
      salt: this.base64(salt),
      verifier: await this.verifier(pin, salt),
      biometric: false,
    };
    await this.put(record);
    this.record = record;
    this.configured.set(true);
    this.unlocked.set(true);
    this.biometricEnabled.set(false);
  }

  async verify(pin: string): Promise<boolean> {
    if (!this.record) return false;
    const candidate = await this.verifier(pin, this.bytes(this.record.salt));
    const valid = this.constantTime(candidate, this.record.verifier);
    if (valid) this.unlocked.set(true);
    return valid;
  }

  async disable(pin: string): Promise<boolean> {
    if (!(await this.verify(pin))) return false;
    await this.remove();
    this.record = undefined;
    this.configured.set(false);
    this.unlocked.set(true);
    this.biometricEnabled.set(false);
    window.LifeLeafNative?.disableBiometric?.();
    return true;
  }

  lock(): void {
    if (this.configured()) this.unlocked.set(false);
  }

  continueAfterUnlock(route: string): void {
    this.routeAfterUnlock = route.startsWith('/') ? route : undefined;
  }

  takeRouteAfterUnlock(): string | undefined {
    const route = this.routeAfterUnlock;
    this.routeAfterUnlock = undefined;
    return route;
  }

  async enableBiometric(pin: string): Promise<boolean> {
    if (
      !this.configured() ||
      !this.biometricAvailable() ||
      !window.LifeLeafNative?.enableBiometric ||
      !(await this.verify(pin))
    )
      return false;
    const result = this.nativeResult('biometric-enabled');
    window.LifeLeafNative.enableBiometric(pin);
    if (!(await result).success || !this.record) return false;
    this.record = { ...this.record, biometric: true };
    await this.put(this.record);
    this.biometricEnabled.set(true);
    return true;
  }

  async authenticateBiometric(): Promise<boolean> {
    if (!this.biometricEnabled() || !window.LifeLeafNative?.authenticateBiometric) return false;
    const result = this.nativeResult('biometric-unlock');
    window.LifeLeafNative.authenticateBiometric();
    const response = await result;
    return response.success ? this.verify(response.data) : false;
  }

  private async verifier(pin: string, salt: Uint8Array): Promise<string> {
    const source = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt).buffer, iterations: 310_000 },
      source,
      256,
    );
    return this.base64(new Uint8Array(bits));
  }
  private constantTime(left: string, right: string): boolean {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    return difference === 0;
  }
  private base64(value: Uint8Array): string {
    return btoa(String.fromCharCode(...value));
  }
  private bytes(value: string): Uint8Array {
    return Uint8Array.from(atob(value), character => character.charCodeAt(0));
  }
  private store(mode: IDBTransactionMode): IDBObjectStore {
    if (!this.database) throw new Error('Security storage is not ready.');
    return this.database.transaction('security', mode).objectStore('security');
  }
  private get(): Promise<LockRecord | undefined> {
    return this.request(this.store('readonly').get('lock'));
  }
  private async put(value: LockRecord): Promise<void> {
    await this.request(this.store('readwrite').put(value));
  }
  private async remove(): Promise<void> {
    await this.request(this.store('readwrite').delete('lock'));
  }
  private request<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  private nativeResult(action: string): Promise<LifeLeafNativeResult> {
    return new Promise(resolve => {
      const listener = (event: Event) => {
        const detail = (event as CustomEvent<LifeLeafNativeResult>).detail;
        if (detail.action !== action) return;
        window.removeEventListener('life-leaf-native-result', listener);
        resolve(detail);
      };
      window.addEventListener('life-leaf-native-result', listener);
    });
  }
}
