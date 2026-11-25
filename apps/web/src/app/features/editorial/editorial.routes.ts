import type { Routes } from '@angular/router';
import { AdminUsersStore } from '../admin-users/admin-users.store';
import { AuditStore } from '../audit/audit.store';
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
    path: 'users',
    providers: [AdminUsersStore],
    children: [
      {
        path: '',
        pathMatch: 'full',
        data: { requiredPermission: 'Users.Manage' },
        loadComponent: () => import('../admin-users/admin-user-list').then((m) => m.AdminUserList),
      },
      {
        path: ':id',
        data: { requiredPermission: 'Users.Manage' },
        loadComponent: () =>
          import('../admin-users/admin-user-detail').then((m) => m.AdminUserDetail),
      },
    ],
  },
  {
    path: 'audit',
    providers: [AuditStore],
    data: { requiredPermission: 'Audit.Read' },
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('../audit/audit-list').then((m) => m.AuditList),
      },
      {
        path: ':id',
        loadComponent: () => import('../audit/audit-detail').then((m) => m.AuditDetail),
      },
    ],
  },
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
