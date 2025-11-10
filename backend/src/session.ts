export type State =
  | 'IDLE'
  | 'ASK_IF_DAR'
  | 'ASK_DISTRICT'   // we reuse this label to expect a WhatsApp location pin (GPS)
  | 'ASK_PLACE'      // legacy (unused now)
  | 'SHOW_PRICE'
  | 'WAIT_PROOF';

export interface Session {
  state: State;
  // Address-ish context (kept for compatibility)
  district?: string;
  place?: string;
  // Pricing context
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
