import { Account, AccountStatus } from './persistence/account.schema';

export function activeSanctionFilter(now: Date) {
  return {
    'activeSanction.id': { $exists: true },
    $or: [
      { 'activeSanction.expiresAt': null },
      { 'activeSanction.expiresAt': { $gt: now } },
    ],
  };
}

export function availableAccount(now = new Date()) {
  return {
    status: AccountStatus.Active,
    $nor: [activeSanctionFilter(now)],
  };
}

export function isSanctioned(account: Account, now: Date): boolean {
  const sanction = account.activeSanction;
  return !!sanction && (!sanction.expiresAt || sanction.expiresAt > now);
}
