import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { OperationsPageQueryDto } from './operations.dto';

export function operationsQuery(
  query: OperationsPageQueryDto,
  filters: unknown[],
) {
  for (const input of [query.fromUtc, query.toUtc]) {
    if (
      input &&
      (!/T.*(?:Z|[+-]\d{2}:?\d{2})$/u.test(input) ||
        !Number.isFinite(Date.parse(input)))
    ) {
      throw new BadRequestException({ code: 'invalid_date_range' });
    }
  }
  const from = query.fromUtc ? new Date(query.fromUtc) : undefined;
  const to = query.toUtc ? new Date(query.toUtc) : undefined;
  if (from && to && from >= to)
    throw new BadRequestException({ code: 'invalid_date_range' });

  const date = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) };
  const limit = query.limit ?? 25;
  const scope = JSON.stringify([
    from?.toISOString(),
    to?.toISOString(),
    ...filters,
  ]);
  const cursor = (id: string) =>
    Buffer.from(scope + '\n' + id).toString('base64url');
  let id: string | undefined;
  if (query.cursor) {
    const candidate = Buffer.from(query.cursor, 'base64url')
      .toString()
      .split('\n')[1];
    if (
      !candidate ||
      !isUUID(candidate, '7') ||
      cursor(candidate) !== query.cursor
    ) {
      throw new BadRequestException({ code: 'invalid_cursor' });
    }
    id = candidate;
  }

  return {
    limit: limit + 1,
    idFilter: id ? { _id: { $lt: id } } : {},
    dateFilter: <K extends string>(field: K) =>
      from || to ? { [field]: date } : {},
    page: <T extends { id: string }>(rows: T[]) => ({
      items: rows.slice(0, limit),
      ...(rows.length > limit
        ? { nextCursor: cursor(rows[limit - 1].id) }
        : {}),
    }),
  };
}
