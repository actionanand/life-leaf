import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  IonBackButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { optionsOutline, searchOutline } from 'ionicons/icons';
import { debounceTime } from 'rxjs';
import { DiaryEntry, EntryQuery } from '../../core/models/diary.models';
import { DiaryService } from '../../core/services/diary.service';
import { EntryCardComponent } from '../../shared/entry-card/entry-card.component';

@Component({
  selector: 'app-search-page',
  templateUrl: './search.page.html',
  styleUrls: ['./search.page.scss'],
  imports: [
    ReactiveFormsModule,
    EntryCardComponent,
    IonBackButton,
    IonButtons,
    IonChip,
    IonContent,
    IonHeader,
    IonIcon,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonToolbar,
  ],
})
export class SearchPage implements OnInit {
  readonly year = input<string>();
  readonly diary = inject(DiaryService);
  private readonly destroyRef = inject(DestroyRef);
  readonly search = new FormControl('', { nonNullable: true });
  readonly results = signal<DiaryEntry[]>([]);
  readonly sort = signal<EntryQuery['sort']>('newest');
  readonly favouriteOnly = signal(false);
  readonly selectedTag = signal<string | undefined>(undefined);
  readonly resultLabel = computed(
    () => `${this.results().length} ${this.results().length === 1 ? 'entry' : 'entries'}`,
  );
  constructor() {
    addIcons({ optionsOutline, searchOutline });
    this.search.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.run());
  }
  async ngOnInit(): Promise<void> {
    await this.diary.initialize();
    await this.run();
  }
  async run(): Promise<void> {
    this.results.set(
      await this.diary.query({
        text: this.search.value,
        year: this.year() ? Number(this.year()) : undefined,
        favourite: this.favouriteOnly() || undefined,
        tagId: this.selectedTag(),
        sort: this.sort(),
        limit: 100,
      }),
    );
  }
  toggleFavourites(): void {
    this.favouriteOnly.update(value => !value);
    void this.run();
  }
  toggleTag(id: string): void {
    this.selectedTag.set(this.selectedTag() === id ? undefined : id);
    void this.run();
  }
}
