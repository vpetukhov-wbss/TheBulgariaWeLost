import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NbButtonModule } from '@nebular/theme';
import { screenPath } from '../screen-links';
import type { AdminMetric } from './admin-metric-card';
import { AdminMetricCard } from './admin-metric-card';

@Component({
  selector: 'app-admin-dashboard-page',
  imports: [AdminMetricCard, RouterLink, NbButtonModule],
  templateUrl: './admin-dashboard-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardPage {
  protected readonly newMaterial = screenPath('29:11796');
  protected readonly metrics: readonly AdminMetric[] = [
    {
      label: 'Чакащи материали',
      value: 12,
      note: '4 нови днес',
      icon: 'file-text-outline',
      path: '/admin/materials',
    },
    {
      label: 'Отворени сигнали',
      value: 4,
      note: '2 с висок приоритет',
      icon: 'flag-outline',
      path: '/admin/reports',
    },
    {
      label: 'Ограничени медии',
      value: 3,
      note: '1 по авторски права',
      icon: 'image-outline',
      path: '/admin/media',
    },
    {
      label: 'Неуспешни задачи',
      value: 2,
      note: 'Индексиране и обработка',
      icon: 'activity-outline',
      path: '/admin/operations',
    },
  ];
  protected readonly panels = [
    {
      title: 'Редакторска опашка',
      description: 'Материали и сигнали, които искат внимание.',
      entries: [
        {
          title: 'Фотографии от завод ДЗУ',
          detail: 'Материал · Мария Димова',
          status: 'За преглед',
          tone: 'warning',
          path: screenPath('5:82'),
        },
        {
          title: 'Права за снимка от 1974 г.',
          detail: 'Сигнал · CASE-028',
          status: 'Висок приоритет',
          tone: 'danger',
          path: screenPath('5:262'),
        },
        {
          title: 'Писма от читалището',
          detail: 'Материал · Петър Иванов',
          status: 'За преглед',
          tone: 'warning',
          path: '/admin/materials',
        },
      ],
    },
    {
      title: 'Състояние на системата',
      description: 'Последна проверка в 10:12 ч.',
      entries: [
        {
          title: 'Архив 01',
          detail: 'Активна цел за нови качвания',
          status: 'Изправно',
          tone: 'success',
          path: '/admin/storage',
        },
        {
          title: 'Резервни копия',
          detail: 'MongoDB и SFTP · днес, 02:15',
          status: 'Актуални',
          tone: 'success',
          path: '/admin/operations',
        },
        {
          title: 'Активни кампании',
          detail: 'Две позиции на сайта',
          status: '2 активни',
          tone: 'info',
          path: '/admin/advertising',
        },
      ],
    },
  ];
}
