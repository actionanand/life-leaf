import { Injectable, inject } from '@angular/core';
import { AlertController } from '@ionic/angular';

interface ConfirmationOptions {
  header: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  destructive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ConfirmationService {
  private readonly alerts = inject(AlertController);

  async confirm(options: ConfirmationOptions): Promise<boolean> {
    const alert = await this.alerts.create({
      header: options.header,
      message: options.message,
      cssClass: 'life-leaf-confirmation',
      buttons: [
        { text: options.cancelText ?? 'Cancel', role: 'cancel' },
        {
          text: options.confirmText,
          role: 'confirm',
          cssClass: options.destructive ? 'life-leaf-destructive-action' : 'life-leaf-confirm-action',
        },
      ],
    });
    await alert.present();
    return (await alert.onDidDismiss()).role === 'confirm';
  }
}
