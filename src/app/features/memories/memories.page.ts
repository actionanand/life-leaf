import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
  SegmentCustomEvent,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { heartOutline, leafOutline } from 'ionicons/icons';
import { localDate } from '../../core/models/diary.models';
import { DiaryService } from '../../core/services/diary.service';
import { EntryCardComponent } from '../../shared/entry-card/entry-card.component';

type MemoryView = 'timeline' | 'on-this-day' | 'years' | 'favourites';

@Component({
  selector: 'app-memories-page',
  templateUrl: './memories.page.html',
  styleUrls: ['./memories.page.scss'],
  imports: [
    DatePipe,
    RouterLink,
    EntryCardComponent,
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonSegment,
    IonSegmentButton,
    IonTitle,
    IonToolbar,
  ],
})
export class MemoriesPage {
  readonly diary = inject(DiaryService);
  readonly view = signal<MemoryView>('timeline');
  readonly today = localDate();
  readonly onThisDay = computed(() =>
    this.diary
      .entries()
      .filter(entry => entry.entryDate.endsWith(this.today.slice(4)) && entry.entryDate !== this.today),
  );
  readonly favourites = computed(() => this.diary.entries().filter(entry => entry.favourite));
  readonly years = computed(() => {
    const counts = new Map<number, number>();
    for (const entry of this.diary.entries()) {
      const year = Number(entry.entryDate.slice(0, 4));
      counts.set(year, (counts.get(year) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) => b - a).map(([year, count]) => ({ year, count }));
  });
  constructor() {
    addIcons({ heartOutline, leafOutline });
  }
  async ionViewWillEnter(): Promise<void> {
    await this.diary.initialize();
    await this.diary.refresh({ limit: 10_000 });
  }
  changeView(event: SegmentCustomEvent): void {
    this.view.set(event.detail.value as MemoryView);
  }
}
