import { DOCUMENT, inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

@Injectable({ providedIn: 'root' })
export class ArchiveSeo {
  private readonly document = inject(DOCUMENT);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  set(
    title: string,
    description: string,
    path: string,
    indexable = true,
    imagePath?: string,
  ): void {
    const url = new URL(path, this.document.location.origin).href;
    const fullTitle = title + ' · България, която изгубихме';
    const canonical =
      this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]') ??
      this.document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = url;
    if (!canonical.isConnected) this.document.head.appendChild(canonical);
    this.title.setTitle(fullTitle);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: fullTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.removeTag('property="og:type"');
    if (imagePath) {
      this.meta.updateTag({ property: 'og:type', content: 'article' });
      this.meta.updateTag({
        property: 'og:image',
        content: new URL(imagePath, this.document.location.origin).href,
      });
      this.meta.updateTag({ property: 'og:image:width', content: '1200' });
      this.meta.updateTag({ property: 'og:image:height', content: '630' });
      this.meta.updateTag({
        property: 'og:image:alt',
        content: 'България, която изгубихме · Дигитален архив',
      });
      this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    } else {
      this.clearEpisodeTags();
    }
    this.meta.updateTag({ name: 'robots', content: indexable ? 'index,follow' : 'noindex,follow' });
  }

  clear(): void {
    this.document.querySelector('link[rel="canonical"]')?.remove();
    for (const selector of [
      'name="description"',
      'name="robots"',
      'property="og:title"',
      'property="og:description"',
      'property="og:url"',
    ]) {
      this.meta.removeTag(selector);
    }
    this.meta.removeTag('property="og:type"');
    this.clearEpisodeTags();
    this.title.setTitle('България, която изгубихме');
  }
  private clearEpisodeTags(): void {
    for (const selector of [
      'property="og:image"',
      'property="og:image:width"',
      'property="og:image:height"',
      'property="og:image:alt"',
      'name="twitter:card"',
    ]) {
      this.meta.removeTag(selector);
    }
  }
}
