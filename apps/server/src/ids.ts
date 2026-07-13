import { randomBytes } from 'node:crypto';

export function generatePlayerId(): string {
  return 'p_' + randomBytes(6).toString('hex');
}

export function generateToken(): string {
  return randomBytes(16).toString('hex');
}
