import { Routes } from '@angular/router';

export const mockRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'demo/19:1791' },
  {
    path: 'demo',
    pathMatch: 'full',
    title: 'Екрани с мок данни · България, която изгубихме',
    loadComponent: () => import('./mock-catalog').then((module) => module.MockCatalog),
  },
  {
    path: 'demo/:screen',
    loadComponent: () => import('./mock-screen').then((module) => module.MockScreen),
  },
  { path: '**', redirectTo: 'demo' },
];
