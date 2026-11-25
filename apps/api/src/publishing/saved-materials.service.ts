import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SavedMaterial } from './persistence/saved-material.schema';
import { PublishingService } from './publishing.service';

@Injectable()
export class SavedMaterialsService {
  constructor(
    @InjectModel(SavedMaterial.name)
    private readonly bookmarks: Model<SavedMaterial>,
    private readonly publishing: PublishingService,
  ) {}

  async list(accountId: string) {
    const bookmarks = await this.bookmarks
      .find({ accountId })
      .sort({ savedAt: -1, _id: -1 })
      .limit(100)
      .exec();
    const items = await Promise.all(
      bookmarks.map(async (bookmark) => {
        try {
          const material = await this.publishing.publicById(
            bookmark.materialId,
          );
          return {
            id: material.id,
            slug: material.slug,
            title: material.content.title,
            savedAtUtc: bookmark.savedAt.toISOString(),
          };
        } catch (error: unknown) {
          if (!(error instanceof NotFoundException)) throw error;
          return null;
        }
      }),
    );
    return { items: items.filter((item) => item !== null) };
  }

  async save(accountId: string, materialId: string): Promise<void> {
    await this.publishing.publicById(materialId);
    await this.bookmarks.updateOne(
      { _id: this.key(accountId, materialId) },
      { $setOnInsert: { accountId, materialId, savedAt: new Date() } },
      { upsert: true },
    );
  }

  async remove(accountId: string, materialId: string): Promise<void> {
    await this.bookmarks.deleteOne({ _id: this.key(accountId, materialId) });
  }

  private key(accountId: string, materialId: string): string {
    return `${accountId}:${materialId}`;
  }
}
