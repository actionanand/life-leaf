import { Routes } from '@angular/router';
import type { EditorPage } from './features/editor/editor.page';

export const routes: Routes = [
  {
    path: 'entry/:id',
    loadComponent: () => import('./features/entry-view/entry-view.page').then(m => m.EntryViewPage),
  },
  {
    path: 'write/:id',
    loadComponent: () => import('./features/editor/editor.page').then(m => m.EditorPage),
    canDeactivate: [(component: EditorPage) => component.canLeaveEditor()],
  },
  {
    path: 'search',
    loadComponent: () => import('./features/search/search.page').then(m => m.SearchPage),
  },
  {
    path: 'data',
    loadComponent: () => import('./features/data/data.page').then(m => m.DataPage),
  },
  {
    path: 'security',
    loadComponent: () => import('./features/security/security.page').then(m => m.SecurityPage),
  },
  {
    path: 'lock',
    loadComponent: () => import('./features/security/lock.page').then(m => m.LockPage),
  },
  {
    path: '',
    loadComponent: () => import('./shell/tabs.page').then(m => m.TabsPage),
    children: [
      {
        path: 'home',
        loadComponent: () => import('./home/home.page').then(m => m.HomePage),
      },
      {
        path: 'calendar',
        loadComponent: () => import('./features/calendar/calendar.page').then(m => m.CalendarPage),
      },
      {
        path: 'memories',
        loadComponent: () => import('./features/memories/memories.page').then(m => m.MemoriesPage),
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings.page').then(m => m.SettingsPage),
      },
      { path: '', redirectTo: 'home', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'home' },
];
