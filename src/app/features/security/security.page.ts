import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { fingerPrintOutline, shieldCheckmarkOutline, trashOutline } from 'ionicons/icons';
import { SecurityService } from '../../core/services/security.service';
import { SnackbarService } from '../../core/services/snackbar.service';

@Component({
  selector: 'app-security-page',
  templateUrl: './security.page.html',
  styleUrls: ['./security.page.scss'],
  imports: [
    ReactiveFormsModule,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonTitle,
    IonToolbar,
  ],
})
export class SecurityPage implements OnInit {
  readonly security = inject(SecurityService);
  private readonly alerts = inject(AlertController);
  private readonly snackbar = inject(SnackbarService);
  readonly busy = signal(false);
  readonly form = new FormGroup({
    current: new FormControl('', { nonNullable: true }),
    pin: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{4,8}$/)] }),
    confirm: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  constructor() {
    addIcons({ fingerPrintOutline, shieldCheckmarkOutline, trashOutline });
  }
  async ngOnInit(): Promise<void> {
    await this.security.initialize();
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.form.controls.pin.value !== this.form.controls.confirm.value) {
      await this.notice('Check the PIN', 'Use 4 to 8 digits and enter the same PIN twice.');
      return;
    }
    if (this.security.configured() && !(await this.security.verify(this.form.controls.current.value))) {
      await this.notice('Current PIN is incorrect', 'Your existing PIN is required before it can be changed.');
      return;
    }
    this.busy.set(true);
    try {
      await this.security.setPin(this.form.controls.pin.value);
      this.form.reset();
      await this.toast('App lock enabled');
    } finally {
      this.busy.set(false);
    }
  }

  async disable(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Disable app lock?',
      message: 'Enter your current PIN. Biometric unlock will also be removed.',
      cssClass: 'life-leaf-confirmation',
      inputs: [{ name: 'pin', type: 'password', placeholder: 'Current PIN', attributes: { inputmode: 'numeric' } }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Disable', role: 'destructive' },
      ],
    });
    await alert.present();
    const result = await alert.onDidDismiss<{ values?: { pin?: string } }>();
    if (result.role !== 'destructive') return;
    if (!(await this.security.disable(result.data?.values?.pin ?? '')))
      await this.notice('PIN is incorrect', 'App lock was not changed.');
    else await this.toast('App lock disabled');
  }
  async biometric(): Promise<void> {
    if (!this.security.configured()) {
      await this.notice('Set a PIN first', 'Biometric unlock can only be enabled after app lock has a PIN.');
      return;
    }
    if (!this.security.biometricAvailable()) {
      await this.notice(
        'Biometric unavailable',
        'This device has no enrolled strong biometric, or this page is open in a browser.',
      );
      return;
    }
    const alert = await this.alerts.create({
      header: 'Enable biometric unlock',
      message: 'Enter your current PIN, then confirm your identity with Android.',
      cssClass: 'life-leaf-confirmation',
      inputs: [{ name: 'pin', type: 'password', placeholder: 'Current PIN', attributes: { inputmode: 'numeric' } }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Continue', role: 'confirm' },
      ],
    });
    await alert.present();
    const result = await alert.onDidDismiss<{ values?: { pin?: string } }>();
    if (result.role !== 'confirm') return;
    if (await this.security.enableBiometric(result.data?.values?.pin ?? ''))
      await this.toast('Biometric unlock enabled');
    else
      await this.notice(
        'Could not enable biometric unlock',
        'Check your PIN and Android biometric settings, then try again.',
      );
  }
  private async notice(header: string, message: string): Promise<void> {
    const alert = await this.alerts.create({ header, message, cssClass: 'life-leaf-confirmation', buttons: ['OK'] });
    await alert.present();
  }
  private async toast(message: string): Promise<void> {
    await this.snackbar.show(message);
  }
}
