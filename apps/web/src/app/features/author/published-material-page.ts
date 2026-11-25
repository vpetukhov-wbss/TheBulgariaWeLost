import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NbAuthService } from '@nebular/auth';
import { NbAlertModule, NbButtonModule, NbCardModule } from '@nebular/theme';
import { firstValueFrom } from 'rxjs';
import type { PublicMaterial } from '../../api/generated/models/public-material';
import { AuthoringService } from '../../api/generated/services/authoring.service';
import { PublishingService } from '../../api/generated/services/publishing.service';
import { actionError } from '../../core/auth/auth-errors';

@Component({
  imports: [RouterLink, NbAlertModule, NbButtonModule, NbCardModule],
  template: `
    @if (material(); as current) {
      <article>
        <nb-card>
          <nb-card-body>
            <h1>{{ current.content.title }}</h1>
            @if (current.content.subtitle) {
              <p>{{ current.content.subtitle }}</p>
            }
            @if (current.content.summary) {
              <p class="summary">{{ current.content.summary }}</p>
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
          </nb-card-body>
        </nb-card>
      </article>
    } @else if (error()) {
      <nb-alert status="warning" role="alert">{{ error() }}</nb-alert>
      <a nbButton outline routerLink="/">Начало</a>
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
export class PublishedMaterialPage implements OnInit {
  private readonly publishing = inject(PublishingService);
  private readonly authoring = inject(AuthoringService);
  private readonly slug = inject(ActivatedRoute).snapshot.paramMap.get('slug') ?? '';
  protected readonly returnTo = inject(Router).url;
  protected readonly signedIn = toSignal(inject(NbAuthService).isAuthenticated());
  protected readonly material = signal<PublicMaterial | null>(null);
  protected readonly error = signal('');
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      this.material.set(
        await firstValueFrom(this.publishing.getPublishedMaterial({ slug: this.slug })),
      );
    } catch (error: unknown) {
      this.error.set(actionError(error, 'Материалът не е достъпен.'));
    }
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
