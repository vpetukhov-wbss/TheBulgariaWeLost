import { Injectable, ServiceUnavailableException } from '@nestjs/common';

const text = { type: 'text', analyzer: 'bulgarian' };
const keyword = { type: 'keyword' };
const mapping = {
  mappings: {
    dynamic: 'strict',
    properties: {
      id: keyword,
      visible: { type: 'boolean' },
      revision: { type: 'integer' },
      title: text,
      summary: text,
      body: text,
      type: keyword,
      language: keyword,
      categoryIds: keyword,
      topicIds: keyword,
    },
  },
};

export type SearchPosition = [number, string];
export type SearchHit = {
  _id: string;
  _source: { revision: number };
  sort: SearchPosition;
};

@Injectable()
export class SearchIndex {
  private readonly origin = process.env.OPENSEARCH_URL;
  private readonly index =
    process.env.OPENSEARCH_INDEX ?? 'archive-materials-v1';
  private readonly username = process.env.OPENSEARCH_USERNAME;
  private readonly password = process.env.OPENSEARCH_PASSWORD;
  private initialized?: Promise<void>;

  constructor() {
    if (!/^[a-z0-9][a-z0-9-]{0,100}$/.test(this.index)) {
      throw new Error('Invalid OPENSEARCH_INDEX.');
    }
    if (!this.origin) return;
    const url = new URL(this.origin);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      Boolean(this.username) !== Boolean(this.password) ||
      (this.username && url.protocol !== 'https:')
    ) {
      throw new Error(
        'Invalid OpenSearch origin or credentials. Use HTTPS with credentials.',
      );
    }
  }

  get enabled(): boolean {
    return Boolean(this.origin);
  }

  async project(id: string, version: number, document: object): Promise<void> {
    await this.prepare();
    const response = await this.request(
      '/' +
        this.index +
        '/_doc/' +
        encodeURIComponent(id) +
        '?version_type=external&version=' +
        version,
      'PUT',
      { id, ...document },
    );
    await response.body?.cancel();
    if (!response.ok && response.status !== 409) this.unavailable();
  }

  async search(
    filters: object[],
    q: string | undefined,
    limit: number,
    after?: SearchPosition,
  ): Promise<SearchHit[]> {
    await this.prepare();
    const response = await this.request('/' + this.index + '/_search', 'POST', {
      size: limit,
      track_total_hits: false,
      _source: ['revision'],
      sort: [{ _score: 'desc' }, { id: 'asc' }],
      ...(after ? { search_after: after } : {}),
      query: {
        bool: {
          filter: [{ term: { visible: true } }, ...filters],
          ...(q
            ? {
                must: [
                  {
                    multi_match: {
                      query: q,
                      fields: ['title^4', 'summary^2', 'body'],
                    },
                  },
                ],
              }
            : {}),
        },
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      this.unavailable();
    }
    const result = (await response.json()) as { hits: { hits: SearchHit[] } };
    return result.hits.hits;
  }

  prepare(): Promise<void> {
    this.initialized ??= this.createIndex().catch((error: unknown) => {
      this.initialized = undefined;
      throw error;
    });
    return this.initialized;
  }

  private async createIndex(): Promise<void> {
    const existing = await this.request('/' + this.index, 'HEAD');
    if (existing.ok) return;
    if (existing.status !== 404) this.unavailable();
    const created = await this.request('/' + this.index, 'PUT', mapping);
    if (created.ok) {
      await created.body?.cancel();
      return;
    }
    const failure = (await created.json().catch(() => null)) as {
      error?: { type?: string };
    } | null;
    if (
      created.status !== 400 ||
      failure?.error?.type !== 'resource_already_exists_exception'
    )
      this.unavailable();
  }

  private async request(
    path: string,
    method: string,
    document?: object,
  ): Promise<Response> {
    if (!this.origin) this.unavailable();
    try {
      const credentials = this.username
        ? Buffer.from(this.username + ':' + this.password).toString('base64')
        : undefined;
      return await fetch(new URL(path, this.origin), {
        method,
        redirect: 'error',
        headers: {
          ...(credentials ? { Authorization: 'Basic ' + credentials } : {}),
          ...(document ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(document ? { body: JSON.stringify(document) } : {}),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      return this.unavailable();
    }
  }

  private unavailable(): never {
    throw new ServiceUnavailableException({
      code: 'archive_search_unavailable',
    });
  }
}
