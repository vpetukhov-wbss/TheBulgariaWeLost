import type { Routes } from '@angular/router';
import { backOfficeGuard, signedInGuard } from './core/auth/auth.guard';

const authPage = () => import('./features/auth/auth-page').then((m) => m.AuthPage);
const authorWorkspace = () =>
  import('./features/author/author-workspace').then((m) => m.AuthorWorkspace);
const materialComposer = () =>
  import('./features/author/material-composer').then((m) => m.MaterialComposer);

const archivePage = () => import('./features/archive/archive-page').then((m) => m.ArchivePage);

export const routes: Routes = [
  { path: '', pathMatch: 'full', loadComponent: () => import('./home').then((m) => m.Home) },
  { path: 'archive', pathMatch: 'full', loadComponent: archivePage },
  { path: 'archive/periods', data: { periods: true }, loadComponent: archivePage },
  { path: 'archive/:kind/:slug', loadComponent: archivePage },
  { path: 'archive/:kind', loadComponent: archivePage },
  { path: 'login', data: { action: 'login' }, loadComponent: authPage },
  { path: 'register', data: { action: 'register' }, loadComponent: authPage },
  { path: 'forgot-password', data: { action: 'forgot' }, loadComponent: authPage },
  { path: 'password-change', data: { action: 'reset' }, loadComponent: authPage },
  { path: 'confirm-email', data: { action: 'confirm' }, loadComponent: authPage },
  { path: 'confirm-new-email', data: { action: 'confirm-new' }, loadComponent: authPage },
  { path: 'account/materials/new', canActivate: [signedInGuard], loadComponent: materialComposer },
  { path: 'account/materials/:id', canActivate: [signedInGuard], loadComponent: materialComposer },
  { path: 'account/materials', canActivate: [signedInGuard], loadComponent: authorWorkspace },
  {
    path: 'account/saved',
    canActivate: [signedInGuard],
    data: { saved: true },
    loadComponent: authorWorkspace,
  },
  {
    path: 'materials/:slug',
    loadComponent: () =>
      import('./features/author/published-material-page').then((m) => m.PublishedMaterialPage),
  },
  {
    path: 'account',
    canActivate: [signedInGuard],
    loadComponent: () => import('./features/account/account').then((m) => m.Account),
  },
  {
    path: 'media/upload',
    canActivate: [signedInGuard],
    loadComponent: () =>
      import('./features/media/pages/media-upload-page').then((m) => m.MediaUploadPage),
  },
  {
    path: 'admin',
    canActivateChild: [backOfficeGuard],
    loadChildren: () =>
      import('./features/editorial/editorial.routes').then((m) => m.editorialRoutes),
  },
  {
    path: 'mfa',
    canActivate: [signedInGuard],
    loadComponent: () => import('./features/auth/mfa-page').then((m) => m.MfaPage),
  },
  {
    path: 'forbidden',
    loadComponent: () => import('./features/auth/forbidden-page').then((m) => m.ForbiddenPage),
  },
  { path: '**', loadComponent: () => import('./not-found').then((m) => m.NotFound) },
];
