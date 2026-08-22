import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, chevronBackOutline, chevronForwardOutline, leafOutline } from 'ionicons/icons';
import { localDate } from '../../core/models/diary.models';
import { DiaryService } from '../../core/services/diary.service';
import { EntryCardComponent } from '../../shared/entry-card/entry-card.component';

interface CalendarDay {
  date: string;
  day: number;
  currentMonth: boolean;
  today: boolean;
  count: number;
}

@Component({
  selector: 'app-calendar-page',
  templateUrl: './calendar.page.html',
  styleUrls: ['./calendar.page.scss'],
  imports: [DatePipe, RouterLink, EntryCardComponent, IonButton, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar],
})
export class CalendarPage {
  readonly diary = inject(DiaryService);
  readonly today = localDate();
  readonly month = signal(new Date());
  readonly selectedDate = signal(this.today);
  readonly weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  readonly monthLabel = computed(() => this.month().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
  readonly selectedEntries = computed(() =>
    this.diary.entries().filter(entry => entry.entryDate === this.selectedDate()),
  );
  readonly days = computed<CalendarDay[]>(() => {
    const month = this.month();
    const year = month.getFullYear();
    const index = month.getMonth();
    const first = new Date(year, index, 1);
    const start = new Date(year, index, 1 - ((first.getDay() + 6) % 7));
    const counts = new Map<string, number>();
    for (const entry of this.diary.entries()) counts.set(entry.entryDate, (counts.get(entry.entryDate) ?? 0) + 1);
    return Array.from({ length: 42 }, (_, offset) => {
      const date = new Date(start);
      date.setDate(start.getDate() + offset);
      const key = localDate(date);
      return {
        date: key,
        day: date.getDate(),
        currentMonth: date.getMonth() === index,
        today: key === this.today,
        count: counts.get(key) ?? 0,
      };
    });
  });

  constructor() {
    addIcons({ addOutline, chevronBackOutline, chevronForwardOutline, leafOutline });
  }
  async ionViewWillEnter(): Promise<void> {
    await this.diary.initialize();
    await this.diary.refresh({ limit: 10_000 });
  }
  previous(): void {
    this.shift(-1);
  }
  next(): void {
    this.shift(1);
  }
  goToday(): void {
    this.month.set(new Date());
    this.selectedDate.set(this.today);
  }
  private shift(amount: number): void {
    const next = new Date(this.month());
    next.setMonth(next.getMonth() + amount);
    this.month.set(next);
  }
}
