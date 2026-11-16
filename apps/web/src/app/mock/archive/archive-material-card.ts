import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface FeaturedMaterial {
  readonly title: string;
  readonly kind: string;
  readonly locationAndDate: string;
  readonly path: string;
  readonly image: string;
  readonly imageAlt: string;
  readonly containImage?: boolean;
}

@Component({
  selector: 'app-archive-material-card',
  imports: [RouterLink],
  template: `
    @let item = material();
    <article class="preview-material-card">
      <img
        [src]="item.image"
        [alt]="item.imageAlt"
        [class.preview-contain-image]="item.containImage"
      />
      <div class="preview-material-text">
        <small>{{ item.kind }}</small>
        <h3>
          <a [routerLink]="item.path">{{ item.title }}</a>
        </h3>
        <p>{{ item.locationAndDate }}</p>
      </div>
    </article>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArchiveMaterialCard {
  readonly material = input.required<FeaturedMaterial>();
}
