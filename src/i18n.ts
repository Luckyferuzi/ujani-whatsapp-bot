// src/i18n.ts
export type Lang = 'sw' | 'en';

type Dict = Record<Lang, Record<string, string>>;

const dict: Dict = {
  sw: {
    /* ===== Menu (aligns with menu.ts) ===== */
    'menu.header': 'Karibu Ujani Herbal 🌿',
    'menu.footer': 'Chagua kutoka kwenye menyu hapa chini.',
    'menu.products_section': 'Angalia Bidhaa zetu',
    'menu.actions_section': 'Vitendo',
    'menu.view_cart': 'Angalia kikapu',
    'menu.checkout': 'Kamilisha oda',
    'menu.track_by_name': 'Fuatilia kwa Jina',
    'menu.talk_to_agent': 'Ongea na Mwakilishi',
    'menu.change_language': 'Badili Lugha',
    'menu.buy_now': 'Nunua sasa',
    'menu.add_to_cart': 'Ongeza kikapuni',
    'menu.more_details': 'Maelezo zaidi',
    'menu.back_to_menu': 'Rudi kwenye menyu',
    'menu.choose_variant': 'Chagua Kipakeji',

    /* ===== Product details (Swahili) ===== */
    'product.kiboko.details': [
      '• *Ujani Kiboko* (dawa ya kupaka) huongeza size na urefu wa uume kwa usalama.',
      '• Huimarisha mishipa, kuongeza msukumo wa damu na uimara.',
      '• Husaidia kuchelewa kufika kileleni (delay) na kuimarisha uwezo wa kusimama.',
      '• Matokeo ya kudumu endapo matumizi yamezingatiwa.',
      '• Inafaa kwa wanaume wa rika zote, matatizo ya muda mrefu au mfupi.',
      '• Tumia kama ilivyoelekezwa kwenye maelekezo ya dawa.',
      '• Tunafanya delivery ndani na nje ya nchi.',
      '• Hakuna athari mbaya iwapo utatumia kama inavyoelekezwa.',
      '• Matumizi ni ya siku 21; matokeo ndani ya siku ~14.',
    ].join('\n'),

    'product.furaha.details': [
      '• *Furaha ya Ndoa* (dawa ya kunywa) huimarisha misuli ya uume na kufanya uume kuwa imara.',
      '• Huarahisisha mzunguko wa damu.',
      '• Huongeza hamu ya tendo la ndoa na uwezo wa mbegu kutungisha mimba.',
      '• Husaidia kudumu muda mrefu (~45+ dakika).',
      '• Dozi: Kijiko 2 asubuhi / mchana / jioni.',
      '• Husaidia pia walioathiriwa na ponografia.',
    ].join('\n'),

    /* ===== Ujani Pro Max packages (SOURCE OF DETAILS) ===== */
    'product.promax.package_a': [
      '• *Ujani Pro Max — Package A*',
      '• Dawa 3 za kunywa (oral).',
      '• Kuongeza nguvu, stamina na kuimarisha mzunguko wa damu.',
      '• Kusaidia kuchelewa kufika kileleni na kuongeza hamu.',
      '• Matumizi kama inavyoelekezwa kwenye dawa.',
    ].join('\n'),

    'product.promax.package_b': [
      '• *Ujani Pro Max — Package B*',
      '• Dawa 3 za kupaka (topical).',
      '• Kuimarisha misuli ya uume na uimara.',
      '• Kuongeza msukumo wa damu na matokeo ya kuongezeka kwa size/urefu.',
      '• Matumizi kama inavyoelekezwa kwenye dawa.',
    ].join('\n'),

    'product.promax.package_c': [
      '• *Ujani Pro Max — Package C*',
      '• Dawa 2 za kupaka + dawa 2 za kunywa.',
      '• Mchanganyiko wa ndani na nje kwa matokeo ya haraka na ya kudumu.',
      '• Kusaidia stamina, uimara, na kuchelewa kufika kileleni.',
      '• Matumizi kama inavyoelekezwa kwenye dawa.',
    ].join('\n'),

    /* ===== Flow ===== */
    'flow.ask_name': 'Karibu! Andika *jina ulilotumia* kufanya oda.',
    'flow.name_saved': 'Asante, *{name}*.',
    'flow.ask_if_dar': 'Je, upo *ndani ya Dar es Salaam*? (Andika *Ndiyo* au *Hapana*)',
    'flow.reply_yes_no': 'Tafadhali jibu *Ndiyo* au *Hapana*.',
    'flow.ask_district': 'Andika *Wilaya* (mf. Temeke, Ilala, Kinondoni, Ubungo, Kigamboni).',
    'flow.ask_place': 'Sawa. Andika *Sehemu/Mtaa* (mf. Keko, Kurasini, Kariakoo...).',
    'flow.distance_quote': 'Umbali uliokadiriwa kutoka Keko hadi *{place}, {district}* ni ~*{km} km*.\nGharama ya uwasilishaji: *{fee} TZS*.',
    'flow.distance_avg_used': 'Hatukupata mtaa huo; tumetumia wastani wa *{district}*.',
    'flow.distance_default_used': 'Hatukupata wilaya hiyo; tumetumia umbali wa chaguo-msingi.',
    'flow.outside_dar_notice': 'Tunaweza kutuma nje ya Dar. Makadirio kwa sasa: *{fee} TZS*.',

    /* ===== Cart / Summary ===== */
    'cart.added': '✅ *{title}* limeongezwa kwenye kikapu.',
    'cart.summary_header': '🧺 Kikapu chako:',
    'cart.summary_line': '• {title} ×{qty} — {price} TZS',
    'cart.summary_total': 'Jumla ya bidhaa: *{total} TZS*',
    'cart.empty': 'Kikapu chako kipo tupu.',
    'cart.choose_action': 'Endelea na hatua:',

    'checkout.summary_header': '📦 Muhtasari wa Oda',
    'checkout.summary_name': 'Jina: {name}',
    'checkout.summary_address_dar': 'Anwani: {place}, {district}',
    'checkout.summary_total': 'Jumla kulipwa: *{total} TZS*',

    /* ===== Payment / Proof ===== */
    'proof.ask': 'Tuma *screenshot ya muamala* au *majina matatu ya mtumaji* kuthibitisha.',
    'proof.ok_image': '✅ Tumepokea *screenshot*. Tunathibitisha malipo yako — tafadhali subiri.',
    'proof.ok_names': '✅ Tumepokea majina ya mtumaji: *{names}*. Tunathibitisha — tafadhali subiri.',
    'proof.invalid': 'Tuma *screenshot* au *majina matatu* ya mtumaji.',

    /* ===== Generic ===== */
    'generic.back': 'Rudi',
    'generic.ok': 'Sawa',
    'generic.open': 'Fungua',
    'generic.choose': 'Chagua',
  },

  en: {
    'menu.header': 'Welcome to Ujani Herbal 🌿',
    'menu.footer': 'Choose from the menu below.',
    'menu.products_section': 'Browse our Products',
    'menu.actions_section': 'Actions',
    'menu.view_cart': 'View cart',
    'menu.checkout': 'Checkout',
    'menu.track_by_name': 'Track by Name',
    'menu.talk_to_agent': 'Talk to an Agent',
    'menu.change_language': 'Change Language',
    'menu.buy_now': 'Buy now',
    'menu.add_to_cart': 'Add to cart',
    'menu.more_details': 'More details',
    'menu.back_to_menu': 'Back to menu',
    'menu.choose_variant': 'Choose Variant',

    'product.kiboko.details': [
      '• *Ujani Kiboko* (topical) safely supports size/length gains.',
      '• Strengthens erectile muscles and firmness.',
      '• Improves blood flow and helps delay ejaculation.',
      '• Long-lasting results when used as directed.',
      '• Suitable for all ages; short/long-term issues.',
      '• Follow the instructions on your bottle.',
      '• We deliver within and outside Tanzania.',
    ].join('\n'),

    'product.furaha.details': [
      '• *Furaha ya Ndoa* (oral) strengthens erectile muscles and improves firmness.',
      '• Improves blood flow.',
      '• Increases libido and fertility potential.',
      '• Helps you last longer (~45+ minutes).',
      '• Dosage: 2 tsp morning / noon / evening.',
      '• Also helpful for pornography side-effects.',
    ].join('\n'),

    /* ===== Ujani Pro Max packages (SOURCE OF DETAILS) ===== */
    'product.promax.package_a': [
      '• *Ujani Pro Max — Package A*',
      '• Three oral medicines.',
      '• Boosts stamina and circulation; helps delay climax.',
      '• Follow usage instructions on the bottle.',
    ].join('\n'),
    'product.promax.package_b': [
      '• *Ujani Pro Max — Package B*',
      '• Three topical medicines.',
      '• Improves firmness and supports size/length results.',
      '• Follow usage instructions on the bottle.',
    ].join('\n'),
    'product.promax.package_c': [
      '• *Ujani Pro Max — Package C*',
      '• Two topical + two oral medicines.',
      '• Combined inside/outside approach for faster, lasting results.',
      '• Follow usage instructions on the bottle.',
    ].join('\n'),

    'flow.ask_name': 'Welcome! Type the *name you used* for the order.',
    'flow.name_saved': 'Thanks, *{name}*.',
    'flow.ask_if_dar': 'Are you *inside Dar es Salaam*? (Reply *Yes* or *No*)',
    'flow.reply_yes_no': 'Please reply *Yes* or *No*.',
    'flow.ask_district': 'Type your *District* (e.g., Temeke, Ilala, Kinondoni, Ubungo, Kigamboni).',
    'flow.ask_place': 'Now type your *Area/Street* (e.g., Keko, Kurasini, Kariakoo...).',
    'flow.distance_quote': 'Estimated distance from Keko to *{place}, {district}*: ~*{km} km*.\nDelivery fee: *{fee} TZS*.',
    'flow.distance_avg_used': 'We couldn’t find that area; used the average for *{district}*.',
    'flow.distance_default_used': 'We couldn’t find that district; used a default distance.',
    'flow.outside_dar_notice': 'We can deliver outside Dar. Current estimate: *{fee} TZS*.',

    'cart.added': '✅ *{title}* added to cart.',
    'cart.summary_header': '🧺 Your cart:',
    'cart.summary_line': '• {title} ×{qty} — {price} TZS',
    'cart.summary_total': 'Items subtotal: *{total} TZS*',
    'cart.empty': 'Your cart is empty.',
    'cart.choose_action': 'Continue with:',

    'checkout.summary_header': '📦 Order Summary',
    'checkout.summary_name': 'Name: {name}',
    'checkout.summary_address_dar': 'Address: {place}, {district}',
    'checkout.summary_total': 'Total to pay: *{total} TZS*',

    'proof.ask': 'Send a *payment screenshot* or the *payer’s three names*.',
    'proof.ok_image': '✅ Screenshot received. We’re verifying your payment — please wait.',
    'proof.ok_names': '✅ Payer’s names received: *{names}*. We’re verifying — please wait.',
    'proof.invalid': 'Please send a screenshot or the payer’s three names.',

    'generic.back': 'Back',
    'generic.ok': 'OK',
    'generic.open': 'Open',
    'generic.choose': 'Choose',
  },
};

function interpolate(s: string, params?: Record<string, string | number>) {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

export function t(lang: Lang, key: string, params?: Record<string, string | number>) {
  const l: Lang = (lang === 'sw' || lang === 'en') ? lang : 'sw';
  const v = dict[l][key] ?? dict.sw[key] ?? key;
  return interpolate(v, params);
}
