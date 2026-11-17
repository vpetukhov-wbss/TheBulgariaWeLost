import type { Routes } from '@angular/router';
import { screenPaths } from './screen-links';

const screenPage = () => import('./mock-screen').then((module) => module.MockScreen);

export const mockRoutes: Routes = [
  ...Object.entries(screenPaths).map(([screen, path]) => ({
    path: path.slice(1),
    pathMatch: 'full' as const,
    data: { screen },
    loadComponent: screenPage,
  })),
  {
    path: 'demo',
    pathMatch: 'full',
    title: 'Екрани с мок данни · България, която изгубихме',
    loadComponent: () => import('./mock-catalog').then((module) => module.MockCatalog),
  },
  { path: 'demo/:screen', loadComponent: screenPage },
  { path: '**', redirectTo: 'demo' },
];
