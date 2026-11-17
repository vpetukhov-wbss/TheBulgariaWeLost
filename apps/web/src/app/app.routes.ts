import type { Routes } from '@angular/router';
import { signedInGuard } from './core/auth/auth.guard';

const authPage = () => import('./features/auth/auth-page').then((m) => m.AuthPage);

export const routes: Routes = [
  { path: '', pathMatch: 'full', loadComponent: () => import('./home').then((m) => m.Home) },
  { path: 'login', data: { action: 'login' }, loadComponent: authPage },
  { path: 'register', data: { action: 'register' }, loadComponent: authPage },
  { path: 'forgot-password', data: { action: 'forgot' }, loadComponent: authPage },
  { path: 'password-change', data: { action: 'reset' }, loadComponent: authPage },
  { path: 'confirm-email', data: { action: 'confirm' }, loadComponent: authPage },
  { path: 'confirm-new-email', data: { action: 'confirm-new' }, loadComponent: authPage },
  {
    path: 'account',
    canActivate: [signedInGuard],
    loadComponent: () => import('./features/account/account').then((m) => m.Account),
  },
  {
    path: 'admin',
    canActivate: [signedInGuard],
    loadComponent: () => import('./features/back-office/back-office').then((m) => m.BackOffice),
  },
  { path: '**', loadComponent: () => import('./not-found').then((m) => m.NotFound) },
];
