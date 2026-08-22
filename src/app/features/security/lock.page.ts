import { NgOptimizedImage } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonInput } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { lockClosedOutline } from 'ionicons/icons';
import { SecurityService } from '../../core/services/security.service';

@Component({
  selector: 'app-lock-page',
  templateUrl: './lock.page.html',
  styleUrls: ['./lock.page.scss'],
  imports: [NgOptimizedImage, ReactiveFormsModule, IonButton, IonContent, IonIcon, IonInput],
})
export class LockPage implements OnInit {
  readonly security = inject(SecurityService);
  private readonly router = inject(Router);
  readonly pin = new FormControl('', { nonNullable: true });
  readonly error = signal('');
  readonly busy = signal(false);
  constructor() {
    addIcons({ lockClosedOutline });
  }
  async ngOnInit(): Promise<void> {
    await this.security.initialize();
    if (!this.security.configured()) await this.router.navigateByUrl('/home', { replaceUrl: true });
  }
  async unlock(): Promise<void> {
    this.busy.set(true);
    try {
      if (await this.security.verify(this.pin.value)) await this.finishUnlock();
      else {
        this.error.set('That PIN did not match. Try again.');
        this.pin.setValue('');
      }
    } finally {
      this.busy.set(false);
    }
  }
  async biometric(): Promise<void> {
    this.error.set('');
    if (await this.security.authenticateBiometric()) await this.finishUnlock();
    else this.error.set('Biometric unlock was cancelled or did not match.');
  }

  private async finishUnlock(): Promise<void> {
    await this.router.navigateByUrl(this.security.takeRouteAfterUnlock() ?? '/home', { replaceUrl: true });
  }
}
