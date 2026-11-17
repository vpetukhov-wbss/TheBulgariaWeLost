import type { Request } from 'express';

export type CorrelatedRequest = Request & {
  correlationId: string;
};

export type RequestWithUser<TUser> = CorrelatedRequest & {
  user: TUser;
};
