import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { NbButtonModule } from '@nebular/theme';
import type { PublicMaterial } from '../../api/generated/models/public-material';
import { SitePresentationResource } from '../../core/site-presentation/site-presentation.resource';

@Component({
  selector: 'app-published-episode',
  imports: [NbButtonModule],
  template: `
    <section aria-label="Видео">
      @if (videoId(); as id) {
        @if (playerUrl(); as url) {
          <iframe
            [src]="url"
            title="Видео на епизода в YouTube"
            referrerpolicy="strict-origin-when-cross-origin"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowfullscreen
          ></iframe>
        }
        <div class="video-actions">
          @if (startSeconds() === undefined) {
            <button nbButton outline type="button" (click)="play(0)">
              Зареди видеото от YouTube
            </button>
          }
          <a [href]="'https://www.youtube.com/watch?v=' + id" rel="external"> Гледай в YouTube </a>
        </div>
      } @else {
        <p>Видеото е недостъпно. Текстът и наличните източници са по-долу.</p>
      }
    </section>
    @if (chapters().length) {
      <section>
        <h2>Времеви точки</h2>
        <ol>
          @for (chapter of chapters(); track chapter.startSeconds) {
            <li>
              @if (videoId()) {
                <button
                  nbButton
                  ghost
                  status="primary"
                  type="button"
                  (click)="play(chapter.startSeconds)"
                >
                  {{ label(chapter.startSeconds) }} · {{ chapter.title }}
                </button>
              } @else {
                {{ label(chapter.startSeconds) }} · {{ chapter.title }}
              }
            </li>
          }
        </ol>
      </section>
    }
    @if (material().content.episode?.transcript; as text) {
      <section>
        <h2>Транскрипция</h2>
        <p class="transcript">{{ text }}</p>
      </section>
    }
    @if (material().episode?.sources?.length) {
      <section>
        <h2>Източници</h2>
        <ul>
          @for (source of material().episode?.sources ?? []; track source.id) {
            <li>
              @if (source.url) {
                <a [href]="source.url" rel="external">{{ source.title }}</a>
              } @else {
                {{ source.title }}
              }
              @if (source.reference) {
                <span> · {{ source.reference }}</span>
              }
            </li>
          }
        </ul>
      </section>
    }
    @if (socialLinks().length) {
      <nav aria-label="Социални канали на архива">
        @for (link of socialLinks(); track link.platform) {
          <a [href]="link.url" rel="me">{{ link.platform }}</a>
        }
      </nav>
    }
  `,
  styles: `
    :host {
      display: block;
      overflow-wrap: anywhere;
    }
    iframe {
      display: block;
      width: 100%;
      aspect-ratio: 16 / 9;
      border: 0;
    }
    .video-actions,
    nav {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      margin-block: 0.75rem;
    }
    li button[nbButton],
    .video-actions button[nbButton] {
      white-space: normal;
      text-align: start;
    }
    .transcript {
      white-space: pre-wrap;
      line-height: 1.65;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublishedEpisode {
  readonly material = input.required<PublicMaterial>();
  private readonly sanitizer = inject(DomSanitizer);
  private readonly site = inject(SitePresentationResource);
  private readonly playback = signal<{ videoId: string; seconds: number } | undefined>(undefined);
  protected readonly videoId = computed(() => {
    const id = this.material().episode?.youtubeVideoId;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : undefined;
  });
  protected readonly startSeconds = computed(() => {
    const playback = this.playback();
    return playback?.videoId === this.videoId() ? playback?.seconds : undefined;
  });
  protected readonly playerUrl = computed(() => {
    const id = this.videoId();
    const seconds = this.startSeconds();
    if (!id || seconds === undefined) return;
    const url = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
    url.searchParams.set('start', String(seconds));
    url.searchParams.set('autoplay', '1');
    return this.sanitizer.bypassSecurityTrustResourceUrl(url.href);
  });
  protected readonly chapters = computed(() =>
    [...(this.material().content.episode?.chapters ?? [])].sort(
      (left, right) => left.startSeconds - right.startSeconds,
    ),
  );
  protected readonly socialLinks = computed(() =>
    this.site
      .settings()
      .socialLinks.filter((link) => ['Facebook', 'Instagram', 'TikTok'].includes(link.platform)),
  );

  protected play(seconds: number): void {
    const videoId = this.videoId();
    if (videoId) this.playback.set({ videoId, seconds });
  }

  protected label(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const fraction = [minutes % 60, seconds % 60].map((num) => String(num).padStart(2, '0'));
    return hours ? [hours, ...fraction].join(':') : fraction.join(':');
  }
}
