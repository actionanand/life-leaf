import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonChip, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { attachOutline, heart, heartOutline, pinOutline } from 'ionicons/icons';
import { DiaryEntry } from '../../core/models/diary.models';
import { DiaryService } from '../../core/services/diary.service';

@Component({
  selector: 'app-entry-card',
  templateUrl: './entry-card.component.html',
  styleUrls: ['./entry-card.component.scss'],
  imports: [DatePipe, RouterLink, IonButton, IonChip, IonIcon],
})
export class EntryCardComponent {
  readonly entry = input.required<DiaryEntry>();
  readonly favourite = output<DiaryEntry>();
  private readonly diary = inject(DiaryService);
  readonly mood = computed(() => (this.entry().moodId ? this.diary.moodMap().get(this.entry().moodId!) : undefined));
  readonly visibleTags = computed(() =>
    this.entry()
      .tagIds.slice(0, 2)
      .map(id => this.diary.tagMap().get(id))
      .filter(Boolean),
  );

  constructor() {
    addIcons({ heart, heartOutline, pinOutline, attachOutline });
  }
}
