import { Role } from '../../persistence/account.schema';

export type JwtPayloadType = {
  id: string;
  role: Role;
  sessionId: string;
};
