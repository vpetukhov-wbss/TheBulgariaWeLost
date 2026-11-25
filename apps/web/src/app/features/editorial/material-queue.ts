import { DatePipe, KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NbAlertModule, NbButtonModule, NbCardModule } from '@nebular/theme';
import { catchError, throwError } from 'rxjs';
import { PublishingService } from '../../api/generated/services/publishing.service';
import { EditorialAccess } from './editorial-access';
import { isKey, materialTypes, publicStages, workingStages } from './editorial-labels';

@Component({
  imports: [
    DatePipe,
    KeyValuePipe,
    FormsModule,
    RouterLink,
    NbAlertModule,
    NbButtonModule,
    NbCardModule,
  ],
  templateUrl: './material-queue.html',
  styleUrl: './editorial.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialQueue {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(PublishingService);
  private readonly access = inject(EditorialAccess);

  private readonly parameters = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly types = materialTypes;
  protected readonly working = workingStages;
  protected readonly visibility = publicStages;
  protected readonly filters = computed(() => {
    const stage = this.parameters().get('stage') ?? '';
    const type = this.parameters().get('type') ?? '';
    return {
      stage: isKey(workingStages, stage) || isKey(publicStages, stage) ? stage : '',
      type: isKey(materialTypes, type) ? type : '',
    };
  });
  protected readonly results = rxResource({
    params: () => {
      const { stage, type } = this.filters();
      return {
        workingStatus: isKey(workingStages, stage) ? stage : undefined,
        status: isKey(publicStages, stage) ? stage : undefined,
        type: isKey(materialTypes, type) ? type : undefined,
      };
    },
    stream: ({ params }) =>
      this.api.listMaterials(params).pipe(
        catchError((error: unknown) => {
          void this.access.redirectOnAccessError(error);
          return throwError(() => error);
        }),
      ),
  });

  protected apply(stage: string, type: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { stage: stage || null, type: type || null },
    });
  }
}
