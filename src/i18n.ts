// src/i18n.ts

export type Lang = 'sw' | 'en';

type Dict = Record<Lang, Record<string, string>>;

const dict: Dict = {
  sw: {
    // ===== Menu (matches menu.ts) =====
    'menu.header': 'Karibu Ujani Herbal 🌿',
    'menu.footer': 'Chagua kutoka kwenye menyu hapa chini.',
    'menu.products_section': 'Angalia Bidhaa zetu',
    'menu.actions_section': 'Vitendo',
    'menu.view_cart': 'Angalia kikapu',
    'menu.checkout': 'Kamilisha oda',
    'menu.track_by_name': 'Fuatilia kwa Jina',
    'menu.talk_to_agent': 'Ongea na Wakala',
    'menu.change_language': 'Badili Lugha',
    'menu.buy_now': 'Nunua sasa',
    'menu.add_to_cart': 'Ongeza kwenye kikapu',
    'menu.more_details': 'Maelezo zaidi',
    'menu.back_to_menu': 'Rudi menyu',
    'menu.choose_variant': 'Chagua kifurushi',

    // ===== Product descriptions (from your zip) =====
    // Kiboko bullets
    'product.kiboko.details': [
      '• Kama unahitaji matokeo ya haraka kwa ajili ya kukuza na kunenepesha zaidi ya nchi saba, tumia *Ujani Kiboko ya Kibamia*.',
      '• Dawa hii ni ya kupaka.',
      '• Imetengenezwa walau mtu mwenye urefu wa nchi tatu afike nchi saba na zaidi.',
      '• Matokeo ya dawa hii ni ya uhakika na ya kudumu.',
      '• Haichagui kama ni tatizo la muda mrefu au la muda mfupi...; hakuna kikwazo kitakachopelekea dawa kushindwa kufanya kazi.',
      '• Sababu: zimetengenezwa kwa kuzingatia viambato vinavyoendana na hormones zilizopo mwilini.',
      '• Matumizi ni ya siku 21; matokeo ndani ya siku ~14.',
      '• Tunafanya delivery ndani na nje ya nchi.',
      '• Matumizi yameainishwa kwenye dawa yako.',
    ].join('\n'),
    // Furaha ya Ndoa bullets
    'product.furaha.details': [
      '• *Furaha ya Ndoa* (dawa ya kunywa) huimarisha misuli ya uume na kufanya uume kuwa imara zaidi.',
      '• Huarahisisha mzunguko wa damu kwenye uume.',
      '• Huongeza hamu ya tendo la ndoa na/au uzalishaji wa mbegu zenye uwezo wa kutungisha mimba.',
      '• Husaidia kudumu muda mrefu — dakika ~45+ na kuunganisha bao la kwanza na la pili.',
      '• Matumizi: vijiko viwili asubuhi, viwili mchana, viwili jioni.',
      '• Pia ni nzuri kwa waathirika wa punyeto.',
    ].join('\n'),
    // Pro Max note (price handled in UI; details/variants chosen in menu)
      'product.promax.package_a': 'Kipakeji A: kinakua na dawa tatu za kunywa.',
   'product.promax.package_b': 'Kipakeji B: kinakua na dawa tatu za kupaka.',
   'product.promax.package_c': 'Kipakeji C: kinakua na dawa za kupaka mbili na kunywa mbili.',

    // ===== Greeting & name-based start =====
    'flow.ask_name': 'Karibu! Tafadhali taja *jina ulilotumia* kwenye oda.',
    'flow.name_saved': 'Asante, *{name}*.',
    'flow.ask_if_dar': 'Je, upo *ndani ya Dar es Salaam*? (Andika *Ndiyo* au *Hapana*)',
    'flow.reply_yes_no': 'Tafadhali jibu *Ndiyo* au *Hapana*.',

    // ===== Dar delivery (District + Place) =====
    'flow.ask_district': 'Tafadhali andika *Wilaya* (mf. *Temeke*, *Ilala*, *Kinondoni*, *Ubungo*, *Kigamboni*).',
    'flow.ask_place': 'Sawa. Sasa andika *Sehemu/Mtaa* (mf. *Keko*, *Kurasini*, *Kariakoo*...).',
    'flow.distance_quote':
      'Umbali uliokadiriwa kutoka Keko Magurumbasi hadi *{place}, {district}* ni ~*{km} km*.\n' +
      'Gharama ya uwasilishaji: *{fee} TZS*.',
    'flow.distance_avg_used': 'Hatukupata sehemu hiyo, tumetumia wastani wa *{district}*.',
    'flow.distance_default_used': 'Hatukupata wilaya hiyo, tumetumia umbali chaguo-msingi.',
    'flow.outside_dar_notice':
      'Tunaweza kutuma nje ya Dar. Gharama zinaweza kutofautiana; makadirio kwa sasa ni *{fee} TZS*.',
      'flow.ask_inside_choice': 'Ungependa *kuchukua ofisini* au *tuletee (delivery)*?',
    'inside.choice_office': 'Chukua ofisini',
    'inside.choice_delivery': 'Tuletee',

    // ===== Cart / Summary =====
    'cart.added': '✅ *{title}* limeongezwa kwenye kikapu.',
    'cart.summary_header': '🧺 Kikapu chako:',
    'cart.summary_line': '• {title} ×{qty} — {price} TZS',
    'cart.summary_total': 'Jumla: {total} TZS',
    'cart.empty': '🧺 Kikapu chako kipo tupu.',
    'cart.choose_action': 'Chagua hatua kwa kikapu:',

    // ===== Checkout & Payment (manual numbers only) =====
    'checkout.summary_header': '📦 Muhtasari wa Oda',
    'checkout.summary_name': 'Jina: {name}',
    'checkout.summary_address_dar': 'Mahali: {place}, {district} — {km} km',
    'checkout.summary_total': 'Jumla: {total} TZS',

    'payment.instructions_header': '*Malipo (TZS):* {amount}',
    'payment.numbers_missing':
      'Kwa sasa namba za malipo hazijawekwa. Baada ya kulipa, tuma *screenshot ya muamala* au andika *majina matatu* ya mtumaji.',
    'payment.choose_number': 'Chagua mojawapo ya namba zifuatazo:',
    'payment.option_line': '{index}. *{label}*: {number}',
    'payment.proof_reminder': 'Baada ya kulipa, tuma *screenshot* au *majina matatu* ya mtumaji kwa uthibitisho.',

    // ===== Proof collection =====
    'proof.ask': 'Tuma *screenshot ya muamala* au andika *majina matatu* ya mtumaji.',
    'proof.ok_image': 'Tumepokea *screenshot* ya malipo. Asante!',
    'proof.ok_names': 'Tumepokea majina ya mtumaji: *{names}*. Asante!',
    'proof.invalid': 'Tafadhali tuma *screenshot* au andika *majina matatu* ya mtumaji.',

    // ===== Tracking (by name) =====
    'track.ask_name': 'Tafadhali andika *jina* ulilotumia kwenye oda ili kufuatilia.',
    'track.none_found': 'Hatukupata oda zinazolingana na jina *{name}*.',
    'track.found_header': 'Oda (jina: {name})',
    'track.item_line': '• {createdAt} — Hali: {status} — Jumla: {total} TZS',

    // ===== Generic =====
    'generic.back': 'Rudi',
    'generic.ok': 'Sawa',
  },

  en: {
    // Keep English concise; Swahili is primary
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
    'menu.choose_variant': 'Choose a package',

    'product.kiboko.details':
      '• Fast results for length/size beyond seven inches.\n' +
      '• Topical application.\n' +
      '• Targets growth from ~3 inches to 7+.\n' +
      '• Reliable and lasting results.\n' +
      '• Works for both chronic and short-term cases.\n' +
      '• Based on ingredients aligned to body hormones.\n' +
      '• 21-day usage; results ~14 days.\n' +
      '• Delivery inside and outside the country.\n' +
      '• Usage is specified with your product.',
    'product.furaha.details':
      '• Strengthens erectile muscles, improves firmness.\n' +
      '• Improves blood flow.\n' +
      '• Increases libido and fertility potential.\n' +
      '• Helps lasting longer — ~45+ minutes.\n' +
      '• Dosage: 2tsp morning / noon / evening.\n' +
      '• Also helpful for pornography side-effects.',
     'product.promax.package_a': 'Package A: three oral (drink) medicines.',
  'product.promax.package_b': 'Package B: three topical (apply) medicines.',
  'product.promax.package_c': 'Package C: two topical and two oral medicines.',

    'flow.ask_name': 'Welcome! Type the *name you used* for the order.',
    'flow.name_saved': 'Thanks, *{name}*.',
    'flow.ask_if_dar': 'Are you *inside Dar es Salaam*? (Reply *Yes* or *No*)',
    'flow.reply_yes_no': 'Please reply *Yes* or *No*.',
    'flow.ask_district': 'Type your *District* (e.g., Temeke, Ilala, Kinondoni, Ubungo, Kigamboni).',
    'flow.ask_place': 'Now type your *Area/Street* (e.g., Keko, Kurasini, Kariakoo...).',
    'flow.distance_quote':
      'Estimated distance from Keko Magurumbasi to *{place}, {district}* is ~*{km} km*.\n' +
      'Delivery fee: *{fee} TZS*.',
    'flow.distance_avg_used': 'Place not found; used the *{district}* average.',
    'flow.distance_default_used': 'District not found; used default distance.',
    'flow.outside_dar_notice': 'We can deliver outside Dar. Current estimate is *{fee} TZS*.',
    'flow.ask_inside_choice': 'Would you like to *pick up at office* or *get delivery*?',
    'inside.choice_office': 'Pick up at office',
    'inside.choice_delivery': 'Deliver to me',

    'cart.added': '✅ *{title}* added to your cart.',
    'cart.summary_header': '🧺 Cart Summary',
    'cart.summary_line': '• {title} ×{qty} — {price} TZS',
    'cart.summary_total': 'Total: {total} TZS',
    'cart.empty': 'Your cart is empty.',
    'cart.choose_action': 'Choose an action below.',

    'checkout.summary_header': '📦 Order Summary',
    'checkout.summary_name': 'Name: {name}',
    'checkout.summary_address_dar': 'Address: {place}, {district} — {km} km',
    'checkout.summary_total': 'Total: {total} TZS',

    'payment.instructions_header': '*Payment (TZS):* {amount}',
    'payment.numbers_missing':
      'Payment numbers are not configured yet. After paying, send a *screenshot* or the *three full names* of the payer.',
    'payment.choose_number': 'Choose one of the following numbers:',
    'payment.option_line': '{index}. *{label}*: {number}',
    'payment.proof_reminder': 'After payment, send a *screenshot* or the *three full names* for verification.',

    'proof.ask': 'Send a *payment screenshot* or type the *three full names* of the payer.',
    'proof.ok_image': 'We received your *screenshot*. Thank you!',
    'proof.ok_names': 'We received the payer names: *{names}*. Thank you!',
    'proof.invalid': 'Please send a *screenshot* or the *three full names* of the payer.',

    'track.ask_name': 'Type the *name* you used for the order to track it.',
    'track.none_found': 'No orders found for *{name}*.',
    'track.found_header': 'Orders (name: {name})',
    'track.item_line': '• {createdAt} — Status: {status} — Total: {total} TZS',

    'generic.back': 'Back',
    'generic.ok': 'OK',
  },
};

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

export function t(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const l = (lang === 'sw' || lang === 'en') ? lang : 'sw';
  const msg = (dict[l] && dict[l][key]) ?? (dict.sw && dict.sw[key]) ?? key;
  return interpolate(msg, params);
}
