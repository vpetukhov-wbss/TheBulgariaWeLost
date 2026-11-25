import type { Routes } from '@angular/router';
import { ModerationStore } from '../moderation/moderation.store';

const catalogEntry = () => import('./catalog-entry').then((m) => m.CatalogEntry);

export const editorialRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('../back-office/back-office').then((m) => m.BackOffice),
  },
  {
    path: 'materials',
    loadComponent: () => import('./material-queue').then((m) => m.MaterialQueue),
  },
  {
    path: 'materials/:id',
    loadComponent: () => import('./material-review').then((m) => m.MaterialReview),
  },
  { path: 'catalog', pathMatch: 'full', redirectTo: 'catalog/topics' },
  {
    path: 'catalog/:kind',
    loadComponent: () => import('./catalog-list').then((m) => m.CatalogList),
  },
  { path: 'catalog/:kind/new', loadComponent: catalogEntry },
  { path: 'catalog/:kind/:id', loadComponent: catalogEntry },
  {
    path: 'moderation',
    providers: [ModerationStore],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('../moderation/moderation-queue').then((m) => m.ModerationQueue),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('../moderation/moderation-detail').then((m) => m.ModerationDetail),
      },
    ],
  },
];
