// Name-based order flow (no order IDs)

export type State =
  | 'ASK_NAME'
  | 'ASK_IF_DAR'
  | 'ASK_DISTRICT'
  | 'ASK_PLACE'
  | 'SHOW_PRICE'
  | 'WAIT_PROOF';

export interface Session {
  state: State;
  name?: string;          // customer name for tracking
  isDar?: boolean;        // ndani ya Dar?
  district?: string;      // wilaya
  place?: string;         // sehemu/mtaa
  distanceKm?: number;    // computed from dar_location.json
  price?: number;         // delivery fee (rounded)
}

const SESS = new Map<string, Session>();

export function getSession(userId: string): Session {
  const s = SESS.get(userId);
  if (s) return s;
  const fresh: Session = { state: 'ASK_NAME' };
  SESS.set(userId, fresh);
  return fresh;
}

export function saveSession(userId: string, data: Session) {
  SESS.set(userId, data);
}

export function resetSession(userId: string) {
  SESS.set(userId, { state: 'ASK_NAME' });
}
