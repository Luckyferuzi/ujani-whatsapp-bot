// src/session.ts

export type State =
  | 'IDLE'         // landing state -> show menu
  | 'ASK_NAME'
  | 'ASK_IF_DAR'
  | 'ASK_DISTRICT'
  | 'ASK_PLACE'
  | 'SHOW_PRICE'
  | 'WAIT_PROOF';

export interface Session {
  state: State;
  name?: string;
  isDar?: boolean;
  district?: string;
  place?: string;
  distanceKm?: number;
  price?: number;
}

const SESS = new Map<string, Session>();

export function getSession(userId: string): Session {
  const s = SESS.get(userId);
  if (s) return s;
  const fresh: Session = { state: 'IDLE' };
  SESS.set(userId, fresh);
  return fresh;
}

export function saveSession(userId: string, data: Session) {
  SESS.set(userId, data);
}

export function resetSession(userId: string) {
  SESS.set(userId, { state: 'IDLE' });
}
