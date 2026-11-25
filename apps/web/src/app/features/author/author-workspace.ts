import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NbAlertModule, NbButtonModule, NbCardModule } from '@nebular/theme';
import { firstValueFrom } from 'rxjs';
import type { MaterialSummary } from '../../api/generated/models/material-summary';
import type { SavedMaterial } from '../../api/generated/models/saved-material';
import { AuthoringService } from '../../api/generated/services/authoring.service';
import { actionError } from '../../core/auth/auth-errors';
import { authorStatus } from './author-status';

@Component({
  imports: [DatePipe, RouterLink, NbAlertModule, NbButtonModule, NbCardModule],
  templateUrl: './author-workspace.html',
  styleUrl: './author-workspace.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthorWorkspace implements OnInit {
  private readonly api = inject(AuthoringService);
  protected readonly savedView = inject(ActivatedRoute).snapshot.data['saved'] === true;
  protected readonly materials = signal<MaterialSummary[]>([]);
  protected readonly saved = signal<SavedMaterial[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly actionError = signal('');
  protected readonly removing = signal('');
  protected readonly status = authorStatus;

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      if (this.savedView) {
        this.saved.set((await firstValueFrom(this.api.listSavedMaterials())).items);
      } else {
        this.materials.set((await firstValueFrom(this.api.listAuthorMaterials())).items);
      }
    } catch (error: unknown) {
      this.loadError.set(actionError(error, 'Списъкът не можа да се зареди.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async remove(id: string): Promise<void> {
    if (this.removing()) return;
    this.removing.set(id);
    this.actionError.set('');
    try {
      await firstValueFrom(this.api.removeSavedMaterial({ id }));
      this.saved.update((items) => items.filter((item) => item.id !== id));
    } catch (error: unknown) {
      this.actionError.set(actionError(error, 'Материалът не можа да се премахне.'));
    } finally {
      this.removing.set('');
    }
  }
}
