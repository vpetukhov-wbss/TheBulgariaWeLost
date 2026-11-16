import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NbButtonModule } from '@nebular/theme';
import { screenPath } from '../screen-links';
import { ArchiveMaterialCard, FeaturedMaterial } from './archive-material-card';
import { ArchiveSearchForm } from './archive-search-form';

@Component({
  selector: 'app-archive-home-page',
  imports: [ArchiveMaterialCard, ArchiveSearchForm, RouterLink, NbButtonModule],
  templateUrl: './archive-home-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArchiveHomePage {
  readonly searchRequested = output<string>();
  protected readonly topic = screenPath('19:2052');
  protected readonly category = screenPath('19:2128');
  protected readonly materials: readonly FeaturedMaterial[] = [
    {
      title: 'Влаковете на БДЖ',
      kind: 'Архивна снимка',
      locationAndDate: 'България · преди 1945 г.',
      path: screenPath('19:1983'),
      image: '/mock-assets/train.jpg',
      imageAlt: 'Парен локомотив на Българските държавни железници',
    },
    {
      title: 'Розобер край Казанлък',
      kind: 'Архивна снимка',
      locationAndDate: 'Казанлък · 1906 г.',
      path: screenPath('19:2341'),
      image: '/mock-assets/roses.jpg',
      imageAlt: 'Розоберачи край Казанлък',
    },
    {
      title: 'Компютърът „Правец 82“',
      kind: 'Снимка на експонат',
      locationAndDate: 'Варна · фотография от 2018 г.',
      path: screenPath('19:2409'),
      image: '/mock-assets/pravetz.jpg',
      imageAlt: 'Компютър „Правец 82“',
      containImage: true,
    },
  ];
}
