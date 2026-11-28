import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NbAuthService } from '@nebular/auth';
import { NbAlertModule, NbButtonModule, NbCardModule } from '@nebular/theme';
import { firstValueFrom } from 'rxjs';
import { AuthoringService } from '../../api/generated/services/authoring.service';
import { PublishingService } from '../../api/generated/services/publishing.service';
import { actionError } from '../../core/auth/auth-errors';
import { ArchiveSeo } from '../archive/archive-seo';
import { PublishedEpisode } from './published-episode';
import { MaterialReportForm } from '../moderation/material-report-form';

@Component({
  imports: [
    RouterLink,
    NbAlertModule,
    NbButtonModule,
    NbCardModule,
    MaterialReportForm,
    PublishedEpisode,
  ],
  template: `
    @if (material(); as current) {
      <article>
        <nb-card>
          <nb-card-body>
            <a routerLink="/archive">Към архива</a>
            <h1>{{ current.content.title }}</h1>
            @if (current.content.historicalYear) {
              <p>
                <a
                  routerLink="/archive/periods"
                  [queryParams]="{
                    fromYear: current.content.historicalYear,
                    toYear: current.content.historicalYear,
                  }"
                  >{{ current.content.historicalYear }} г.</a
                >
              </p>
            }
            @if (current.content.subtitle) {
              <p>{{ current.content.subtitle }}</p>
            }
            @if (current.content.summary) {
              <p class="summary">{{ current.content.summary }}</p>
            }
            @if (current.type === 'Episode') {
              <app-published-episode [material]="current" />
            }
            <div class="actions">
              @if (signedIn()) {
                <button
                  nbButton
                  outline
                  type="button"
                  [disabled]="saving() || saved()"
                  (click)="save(current.id)"
                >
                  {{ saved() ? 'Запазен материал' : 'Запази материала' }}
                </button>
                <a routerLink="/account/saved">Запазени материали</a>
              } @else {
                <a nbButton outline routerLink="/login" [queryParams]="{ returnTo }"
                  >Влез, за да запазиш материала</a
                >
              }
            </div>
            @if (saved()) {
              <p role="status">Добавен в запазените материали.</p>
            }
            @if (error()) {
              <nb-alert status="danger" role="alert">{{ error() }}</nb-alert>
            }
            @if (current.content.body) {
              <p class="content">{{ current.content.body }}</p>
            }
            @for (block of current.content.blocks ?? []; track block.id) {
              @switch (block.type) {
                @case ('Heading') {
                  <h2 class="content">{{ block.text }}</h2>
                }
                @case ('Quote') {
                  <blockquote class="content">{{ block.text }}</blockquote>
                }
                @case ('Paragraph') {
                  <p class="content">{{ block.text }}</p>
                }
              }
            }
            <app-material-report-form [slug]="current.slug" />
          </nb-card-body>
        </nb-card>
      </article>
    } @else if (loadError()) {
      <nb-alert status="warning" role="alert">{{ loadError() }}</nb-alert>
      @if (!withdrawn()) {
        <button nbButton outline type="button" (click)="publication.reload()">Опитай отново</button>
      }
      <a nbButton outline routerLink="/archive">Към архива</a>
    } @else {
      <p role="status">Зарежда се материалът…</p>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 48rem;
        margin-inline: auto;
      }
      h1 {
        font-size: clamp(1.6rem, 5vw, 2.5rem);
        overflow-wrap: anywhere;
      }
      .summary {
        font-weight: 600;
      }
      .content {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        line-height: 1.65;
      }
      blockquote {
        margin-inline: 0;
        border-inline-start: 0.2rem solid var(--color-primary-500);
        padding-inline-start: 1rem;
      }
      .actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin-block: 1rem;
      }
      .actions a[nbButton] {
        white-space: normal;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublishedMaterialPage {
  private readonly publishing = inject(PublishingService);
  private readonly authoring = inject(AuthoringService);
  private readonly router = inject(Router);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap, { requireSync: true });
  protected get returnTo(): string {
    return this.router.url;
  }
  protected readonly signedIn = toSignal(inject(NbAuthService).isAuthenticated());
  protected readonly publication = rxResource({
    params: () => ({ slug: this.params().get('slug') ?? '' }),
    stream: ({ params }) => this.publishing.getPublishedMaterial(params),
  });
  protected readonly material = computed(() =>
    this.publication.hasValue() ? this.publication.value() : undefined,
  );
  protected readonly withdrawn = computed(() => {
    const error = this.publication.error();
    return error instanceof HttpErrorResponse && error.status === 404;
  });
  protected readonly loadError = computed(() => {
    if (!this.publication.error()) return '';
    return this.withdrawn()
      ? 'Материалът е свален или вече е недостъпен.'
      : 'Материалът временно не може да се зареди.';
  });
  protected readonly error = signal('');
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);

  constructor() {
    const seo = inject(ArchiveSeo);
    inject(DestroyRef).onDestroy(() => seo.clear());
    effect(() => {
      if (this.publication.isLoading()) return;
      const material = this.material();
      const isEpisode = material?.type === 'Episode';
      seo.set(
        material?.content.title ?? 'Материал',
        (
          material?.content.summary?.trim() ||
          material?.content.subtitle?.trim() ||
          (isEpisode ? 'Епизод от българския архив.' : 'Материал от българския архив.')
        ).slice(0, 160),
        '/materials/' + encodeURIComponent(material?.slug ?? this.params().get('slug') ?? ''),
        Boolean(material),
        isEpisode ? '/assets/episode-share.png' : undefined,
      );
    });
    effect(() => {
      this.params();
      this.saved.set(false);
      this.error.set('');
    });
  }

  protected async save(id: string): Promise<void> {
    if (this.saving()) return;
    this.error.set('');
    this.saving.set(true);
    try {
      await firstValueFrom(this.authoring.saveMaterial({ id }));
      this.saved.set(true);
    } catch (error: unknown) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 401
          ? 'Сесията изтече. Влез отново, за да запазиш материала.'
          : actionError(error, 'Материалът не можа да се запази.'),
      );
    } finally {
      this.saving.set(false);
    }
  }
}
