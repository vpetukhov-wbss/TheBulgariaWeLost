import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AllConfigType } from '../../config/config.type';
import { storageProfilePattern, StorageConnectionStatus } from './storage.dto';

@Injectable()
export class StorageProfileClient {
  constructor(private readonly config: ConfigService<AllConfigType>) {}

  async list(): Promise<string[]> {
    try {
      const response = await this.request('profiles', 'GET');
      if (response.ok) {
        const ids: unknown = await response.json();
        if (
          Array.isArray(ids) &&
          ids.every(
            (id): id is string =>
              typeof id === 'string' && storageProfilePattern.test(id),
          )
        )
          return [...new Set(ids)].sort((left, right) =>
            left.localeCompare(right),
          );
      }
    } catch {
      // The media service can be offline while existing uploads are still tracked.
    }
    throw new ServiceUnavailableException({
      code: 'storage_profiles_unavailable',
    });
  }

  async probe(
    profileId: string,
    correlationId: string,
  ): Promise<StorageConnectionStatus> {
    try {
      const response = await this.request(
        encodeURIComponent(profileId) + '/probe',
        'POST',
        correlationId,
      );
      if (response.status === 204) return StorageConnectionStatus.Healthy;
      if (response.status === 403) {
        const problem = (await response.json()) as { code?: string };
        if (problem.code === 'storage_access_denied') {
          return StorageConnectionStatus.Denied;
        }
        return StorageConnectionStatus.Unavailable;
      }
      await response.body?.cancel();
    } catch {
      // Report a stable state instead of exposing details about the SSH connection.
    }
    return StorageConnectionStatus.Unavailable;
  }

  private request(
    path: string,
    method: 'GET' | 'POST',
    correlationId?: string,
  ): Promise<Response> {
    const origin = this.config.getOrThrow('media.probeOrigin', { infer: true });
    const token = this.config.getOrThrow('media.probeToken', { infer: true });
    if (!origin || !token) {
      throw new ServiceUnavailableException({
        code: 'storage_profiles_unavailable',
      });
    }
    return fetch(new URL('/internal/media/v1/storage/' + path, origin), {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        ...(correlationId ? { 'X-Correlation-ID': correlationId } : {}),
      },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
  }
}
