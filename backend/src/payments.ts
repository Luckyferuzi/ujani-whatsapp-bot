import { env } from './config.js';

type Opt = { label: string; number: string };

function options(): Opt[] {
  const opts: Opt[] = [];
  if (env.LIPA_NAMBA_TILL) opts.push({ label: 'Tigo Lipa Namba', number: env.LIPA_NAMBA_TILL });
  if (env.VODA_LNM_TILL)   opts.push({ label: 'Voda Lipa Namba', number: env.VODA_LNM_TILL });
  if (env.VODA_P2P_MSISDN) opts.push({ label: 'Voda (Normal)',   number: env.VODA_P2P_MSISDN });
  return opts;
}

/** Build the payment instruction text (numbers only; no account name) */
export function buildPaymentMessage(totalTZS: number): string {
  const amount = (Math.floor(totalTZS) || 0).toLocaleString('sw-TZ');
  const header = `*Malipo (TZS):* ${amount}\n`;
  const opts = options();

  if (!opts.length) {
    return header +
      `\nKwa sasa namba za malipo hazijawekwa.\n` +
      `⏩ Baada ya kulipa, tuma *screenshot ya muamala* au andika *majina matatu* ya mtumaji (kwa uthibitisho).`;
  }

  const list = opts.map((o, i) => `${i + 1}. *${o.label}*: ${o.number}`).join('\n');
  return header +
    `\nChagua mojawapo ya namba zifuatazo:\n${list}\n\n` +
    `Baada ya kulipa, tuma *screenshot ya muamala* au andika *majina matatu* ya mtumaji (kwa uthibitisho).`;
}
