import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';

interface SnackbarOptions {
  duration?: number;
  actionText?: string;
  icon?: string;
}

@Injectable({ providedIn: 'root' })
export class SnackbarService {
  private readonly toasts = inject(ToastController);

  async show(message: string, options: SnackbarOptions = {}): Promise<void> {
    const toast = await this.toasts.create({
      message,
      duration: options.duration ?? 2_200,
      position: 'bottom',
      icon: options.icon,
      cssClass: 'life-leaf-snackbar',
      buttons: options.actionText ? [{ text: options.actionText, role: 'cancel' }] : undefined,
    });
    await toast.present();
  }
}
