import { DatePipe, NgOptimizedImage } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonBadge,
  IonButton,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
  RefresherCustomEvent,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline,
  chevronForwardOutline,
  heartOutline,
  imagesOutline,
  leafOutline,
  pricetagsOutline,
  searchOutline,
  timeOutline,
} from 'ionicons/icons';
import { WRITING_PROMPTS } from '../core/data/defaults';
import { localDate } from '../core/models/diary.models';
import { DiaryService } from '../core/services/diary.service';
import { EntryCardComponent } from '../shared/entry-card/entry-card.component';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    DatePipe,
    NgOptimizedImage,
    RouterLink,
    EntryCardComponent,
    IonBadge,
    IonButton,
    IonContent,
    IonFab,
    IonFabButton,
    IonHeader,
    IonIcon,
    IonRefresher,
    IonRefresherContent,
    IonSkeletonText,
    IonTitle,
    IonToolbar,
  ],
})
export class HomePage {
  readonly diary = inject(DiaryService);
  readonly today = localDate();
  readonly todayEntries = computed(() => this.diary.entries().filter(entry => entry.entryDate === this.today));
  readonly recentEntries = computed(() => this.diary.entries().slice(0, 5));
  readonly greeting = computed(() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  });
  readonly prompt = WRITING_PROMPTS[new Date().getDate() % WRITING_PROMPTS.length];
  readonly memory = computed(() => {
    const suffix = this.today.slice(4);
    return this.diary.entries().find(entry => entry.entryDate.endsWith(suffix) && entry.entryDate !== this.today);
  });

  constructor() {
    addIcons({
      addOutline,
      chevronForwardOutline,
      heartOutline,
      imagesOutline,
      leafOutline,
      pricetagsOutline,
      searchOutline,
      timeOutline,
    });
  }

  async ionViewWillEnter(): Promise<void> {
    await this.diary.initialize();
    await this.diary.refresh({ limit: 30 });
  }

  async refresh(event: RefresherCustomEvent): Promise<void> {
    await this.diary.refresh({ limit: 30 });
    await event.target.complete();
  }
}
