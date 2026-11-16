import { importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { NbThemeModule } from '@nebular/theme';
import { MockApp } from './app/mock/mock-app';
import { mockRoutes } from './app/mock/mock-routes';

bootstrapApplication(MockApp, {
  providers: [
    provideZoneChangeDetection(),
    provideRouter(mockRoutes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
    importProvidersFrom(NbThemeModule.forRoot({ name: 'default' })),
  ],
}).catch(console.error);
