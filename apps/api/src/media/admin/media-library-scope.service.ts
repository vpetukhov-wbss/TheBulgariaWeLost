import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type PipelineStage } from 'mongoose';
import { Role } from '../../auth/persistence/account.schema';
import type { SignedInAccount } from '../../auth/strategies/jwt.strategy';
import { MaterialRevision } from '../../publishing/persistence/material.schema';
import type { MediaUpload } from '../persistence/media-upload.schema';
import type { MediaUsageDto, MediaUsagesDto } from './admin-media.dto';

type Viewer = SignedInAccount['profile'];

@Injectable()
export class MediaLibraryScope {
  constructor(
    @InjectModel(MaterialRevision.name)
    private readonly revisions: Model<MaterialRevision>,
  ) {}

  async requireVisible(asset: MediaUpload, viewer: Viewer): Promise<void> {
    if (asset.accountId === viewer.id || viewer.role === Role.Administrator)
      return;
    const [reference] = await this.revisions.aggregate([
      { $match: { 'content.mediaRefs.mediaId': asset._id } },
      ...this.visibleReferences(viewer),
      { $limit: 1 },
    ]);
    if (!reference) throw new NotFoundException({ code: 'media_not_found' });
  }

  galleryScope(viewer: Viewer): PipelineStage[] {
    if (viewer.role === Role.Administrator) return [];
    return [
      {
        $lookup: {
          from: 'materialRevisions',
          localField: '_id',
          foreignField: 'content.mediaRefs.mediaId',
          pipeline: [
            ...this.visibleReferences(viewer),
            { $limit: 1 },
            { $project: { _id: 1 } },
          ],
          as: 'visibleUsage',
        },
      },
      {
        $match: {
          $or: [
            { accountId: viewer.id },
            { 'visibleUsage.0': { $exists: true } },
          ],
        },
      },
    ];
  }

  async usages(assetId: string, viewer: Viewer): Promise<MediaUsagesDto> {
    const [result] = await this.revisions.aggregate<{
      items: MediaUsageDto[];
      counts: { total: number }[];
    }>([
      { $match: { 'content.mediaRefs.mediaId': assetId } },
      ...this.visibleReferences(viewer),
      { $sort: { revisionNumber: -1, _id: -1 } },
      {
        $group: {
          _id: '$materialId',
          title: { $first: '$content.title' },
          revisionNumber: { $first: '$revisionNumber' },
        },
      },
      {
        $facet: {
          items: [
            { $sort: { _id: -1 } },
            { $limit: 25 },
            {
              $project: {
                _id: 0,
                materialId: '$_id',
                title: 1,
                revisionNumber: 1,
              },
            },
          ],
          counts: [{ $count: 'total' }],
        },
      },
    ]);
    return { items: result?.items ?? [], total: result?.counts[0]?.total ?? 0 };
  }

  private visibleReferences(
    viewer: Viewer,
  ): (PipelineStage.Lookup | PipelineStage.Unwind | PipelineStage.Match)[] {
    return [
      {
        $lookup: {
          from: 'materials',
          localField: 'materialId',
          foreignField: '_id',
          as: 'material',
        },
      },
      { $unwind: '$material' },
      {
        $match: {
          ...(viewer.role === Role.Administrator
            ? {}
            : {
                $or: [
                  { 'material.authorId': viewer.id },
                  { 'material.hasBeenSubmitted': true },
                ],
              }),
          $expr: {
            $in: [
              '$revisionNumber',
              [
                '$material.workingRevisionNumber',
                '$material.publishedRevisionNumber',
              ],
            ],
          },
        },
      },
    ];
  }
}
