// src/i18n.ts
// Bilingual WhatsApp copy (🇹🇿 Swahili + 🇬🇧 English) with full product details.
// - Light emojis for scannability
// - Mobile-friendly line lengths
// - Backwards friendly: common product aliases included
// - Array values are joined with newline in t()

import type { Lang } from './session.js';

type Dict = Record<Lang, Record<string, string | string[]>>;

/** Replace {placeholders} in strings */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

/** Get translated string with fallback to EN if key missing in current lang */
export function t(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const base = (dict[lang] && dict[lang][key]) ?? (dict.en && dict.en[key]);
  const s = Array.isArray(base) ? base.join('\n') : String(base ?? key);
  return interpolate(s, params);
}

/* -------------------------------------------------------------------------- */
/*                                  STRINGS                                   */
/* -------------------------------------------------------------------------- */

const dict: Dict = {
  /* ================================ SWAHILI ================================ */
  sw: {
    /* ------------------------------- General ------------------------------ */
    app_hello: "Habari! 👋",
    app_welcome: "Karibu Ujani — huduma ya haraka na rahisi.",
    menu_button: "Fungua",
    back_to_menu: "🔙 Rudi menyu",
    thanks: "Asante! 🙏",
    invalid_choice: "Samahani, chaguo si sahihi. Jaribu tena.",
    try_again: "Tafadhali jaribu tena baada ya muda mfupi.",
    say_next: "Tuma *next* kuona zaidi.",
    yes: "Ndiyo",
    no: "Hapana",

    /* -------------------------------- Menu -------------------------------- */
    menu_body: "Habari! 👋\nTunawezaje kukusaidia leo? Chagua hapa chini.",
    section_products: "🛍️ Bidhaa",
    section_help: "🆘 Msaada",
    section_settings: "⚙️ Mipangilio",
    talk_agent_title: "👨‍💼 Ongea na Wakala",
    talk_agent_desc: "Pata usaidizi wa haraka kutoka kwa binadamu",
    track_order_title: "📦 Fuatilia Oda",
    track_order_desc: "Angalia hali ya oda yako",

    /* ------------------------------- Products ------------------------------ */
    products_title: "🛍️ Bidhaa zetu",
    products_pick: "Chagua bidhaa au uliza swali.",
    product_more_details: "ℹ️ Maelezo zaidi",
    product_add_to_cart: "➕ Ongeza kwenye kikapu",
    product_buy_now: "⚡ Nunua sasa",

    /* -------- Aliases often used in menus (don’t break old references) ----- */
    btn_more_details: "ℹ️ Maelezo zaidi",
    btn_add_to_cart: "➕ Ongeza kwenye kikapu",
    btn_buy_now: "⚡ Nunua sasa",

    /* ==================== UJANI — DAWA YA KUPAKA (KIBOKO) ================== */
    product_kiboko_title: "Ujani — Dawa ya Kupaka (Kiboko)",
    kiboko_title: "Ujani — Dawa ya Kupaka (Kiboko)",
    product_kiboko_tagline: "Kwa matokeo ya haraka ya kukuza na kunenepesha — ya kupaka. 🧴🚀",
    product_kiboko_price_label: "Bei: TZS {price}",
    // Bullet points from your exact description, split smartly
    product_kiboko_points: [
      "🚀 Kama unahitaji matokeo ya haraka kwaajili ya kukuza na kunenepesha zaidi ya Nchi Saba — tumia Ujani Kiboko ya kibamia.",
      "🧴 Dawa hii ni ya kupaka.",
      "📏 Imetengenezwa walau mtu mwenye urefu wa Nchi Tatu afike Nchi Saba na zaidi.",
      "✅ Matokeo ya dawa hii ni ya uhakika na ya kudumu.",
      "⏱️ Haichagui kama ni tatizo la muda mrefu au la muda mfupi; hakuna kikwazo kitakacho pelekea dawa kuto kufanya kazi.",
      "🧬 Sababu: dawa hizi zimetengenezwa kwa kuzingatia *ingredients* zinazoendana na *hormones* zilizopo mwilini.",
      "📆 Kozi ya matumizi ni siku 21; matokeo huonekana ndani ya siku 14.",
      "🚚 Delivery ndani na nje ya Nchi tunafanya.",
      "📄 Matumizi ya dawa yameainishwa kwenye dawa yako."
    ],

    /* ==================== UJANI — DAWA YA KUNYWA (FURAHA) ================== */
    product_furaha_title: "Ujani — Dawa ya Kunywa (Furaha)",
    furaha_title: "Ujani — Dawa ya Kunywa (Furaha)",
    product_furaha_tagline: "“Furaha ya ndoa” — ya kunywa, kwa uimara na muda mrefu. 🍵💪",
    product_furaha_price_label: "Bei: TZS {price}",
    product_furaha_points: [
      "🍵 Dawa ya kunywa ambayo ni *furaha ya ndoa* — itakusaidia kuimarisha misuli ya uume na kufanya uume kuwa imara zaidi.",
      "🩸 Inasaidia kufanya mzunguko wa damu kwenye uume kuwa rahisi.",
      "🔥 Inaongeza hamu ya tendo la ndoa au uzalishaji wa mbegu kwa wingi na zenye uwezo wa kutungisha mimba.",
      "⏱️ Inasaidia kulimudu tendo la ndoa kwa muda mrefu (dakika ~45+) na kuwa na uwezo wa kuunganisha bao la kwanza na la pili.",
      "🥄 Matumizi: vijiko viwili asubuhi, viwili mchana na viwili jioni.",
      "🛡️ Pia ni nzuri kwa waathirika wa punyeto.",
      "🚚 Delivery ndani na nje ya Nchi; matumizi yameainishwa kwenye dawa."
    ],

    /* --------------------------- Catalog: Pro Max -------------------------- */
    product_promax_title: "Pro Max",
    promax_title: "Pro Max",
    product_promax_tagline: "Huduma ya kiwango cha juu kwa mahitaji makubwa 🚀",
    product_promax_desc: [
      "📦 Kifurushi cha kiwango cha juu chenye vipengele vilivyoimarishwa.",
      "🧑‍🔧 Kipaumbele kwenye usaidizi na ufuatiliaji.",
      "📈 Inafaa biashara/maeneo yenye mahitaji makubwa."
    ],
    product_promax_a_title: "Pro Max A",
    product_promax_a_points: [
      "✅ Vipengele vya msingi vya Pro Max",
      "🕒 Ratiba ya huduma iliyorahisishwa",
      "💬 Usaidizi wa kipaumbele"
    ],
    product_promax_b_title: "Pro Max B",
    product_promax_b_points: [
      "➕ Vipengele zaidi kuliko A",
      "🛠️ Tahadhari/ukaguzi wa ziada",
      "📊 Ripoti fupi ya utendaji"
    ],
    product_promax_c_title: "Pro Max C",
    product_promax_c_points: [
      "🏆 Kifurushi kamili cha Pro Max",
      "🧪 Ukaguzi wa kina + ufuatiliaji",
      "📞 Mstari wa msaada wa kipaumbele (extended)"
    ],
    product_promax_price_label: "Bei: TZS {price}",

    /* ---------------------------- Parcels / Packages ----------------------- */
    parcel_small_title: "Kifurushi Kidogo",
    parcel_small_desc: "Kwa oda ndogo/nyepesi 📦",
    parcel_medium_title: "Kifurushi cha Kati",
    parcel_medium_desc: "Usawaziko wa gharama na uwezo 📦📦",
    parcel_large_title: "Kifurushi Kikubwa",
    parcel_large_desc: "Kwa oda kubwa/zito 📦📦📦",

    /* -------------------------------- Cart -------------------------------- */
    cart_empty: "🧺 Kikapu chako kiko tupu.",
    cart_summary_title: "🧺 Muhtasari wa Kikapu",
    cart_summary_line: "• {title} ×{qty} — {price}",
    cart_summary_total: "Jumla: {total}",
    cart_actions: "Chagua hatua kwa kikapu:",
    btn_cart_checkout: "✅ Kamilisha oda",
    btn_cart_clear: "🧹 Futa kikapu",
    btn_cart_back: "🔙 Rudi menyu",

    /* ----------------------------- Fulfillment ---------------------------- */
    choose_fulfillment: "Ungependa kuipata vipi bidhaa? 🚚🏢",
    btn_pickup: "🏢 Chukua ofisini",
    btn_delivery: "🚚 Letewa (Delivery)",

    /* --------------------------- Customer details ------------------------- */
    ask_name: "Taja *jina lako kamili* 🙏",
    ask_delivery_phone: "Weka namba ya simu ya kupokelea mzigo ☎️",
    ask_address: "Andika *anuani yako kamili* (mtaa/jengo, nk.) 🏠",

    /* -------------------------- Smart Delivery (NEW) ---------------------- */
    pick_district_title: "Chagua Wilaya 🗺️",
    pick_district_body: "Tafadhali chagua wilaya yako ili tuanze.",
    pick_ward_title: "Chagua Kata 📍",
    pick_ward_body: "Chagua kata ili kubaini umbali na gharama.",
    pick_street_title: "Chagua Mtaa (hiari) 🧭",
    pick_street_body: "Kwa usahihi zaidi wa gharama, chagua mtaa wako au *tuma Location*.",
    pick_street_skip: "⏭️ Ruka mtaa",
    pick_street_share_location: "📡 Tuma Location",
    street_page_more: "Orodha inaendelea… jibu kwa namba au tuma *next* kuendelea.",
    street_selected: "✅ {ward} — umechagua: {street}.",
    street_skipped: "⏭️ {ward} — mtaa umerukwa; tutatumia umbali wa kata.",
    send_location_hint: "Tafadhali tuma *Location* yako kupitia WhatsApp.",
    delivery_quote: "📏 Umbali uliotumika: ~{km} km\n💵 Gharama ya usafirishaji: TZS {fee}",

    /* -------------------------------- Summary ----------------------------- */
    summary_title: "📦 Muhtasari wa Oda",
    summary_address: "Eneo: {district}, {ward}{street_line}",
    summary_street_line: ", {street}",
    summary_delivery_fee: "Usafirishaji: TZS {fee}",
    summary_total: "Jumla: TZS {total}",
    summary_confirm: "Uthibitishe ili tuendelee ✅",

    /* -------------------------------- Payment ----------------------------- */
    pay_title: "💳 Malipo",
    pay_instructions:
      "Lipa jumla ya *TZS {amount}*.\nUkishalipa, tuma ujumbe au *ambatanisha ushahidi* hapa.",
    pay_attach_proof: "📎 Tuma picha ya risiti/ushahidi wa malipo.",
    pay_received_full: "✅ Malipo yamepokelewa kikamilifu. Asante!",
    pay_received_partial:
      "ℹ️ Tumepokea malipo ya *TZS {amount}*. Baki: *TZS {balance}*.",
    pay_reference_prompt: "Taja *kumbukumbu ya muamala* au uambatanishe risiti.",
    balance_due: "Baki kulipa: *TZS {balance}*",

    /* ------------------------------ Order status -------------------------- */
    order_status_prefix: "Hali ya oda {orderId}:",
    order_pending: "⌛ Inasubiri malipo/uthibitisho.",
    order_paid: "✅ Imelipwa, inasubiri kusafirishwa.",
    order_enroute: "🚚 Inaelekea kwako.",
    order_delivered: "📬 Imewasili. Asante kwa kununua!",
    order_ref: "Kumbukumbu: {orderId}",

    /* ------------------------------ Human handoff ------------------------- */
    agent_handoff_intro:
      "👨‍💼 Unahitaji kuongea na wakala? Chagua *Ongea na Wakala*.",
    agent_handoff_confirm: "Umeunganishwa na wakala. 🤝",
    agent_resume_bot: "Bot imewashwa tena. 🤖",

    /* --------------------------------- Admin ------------------------------ */
    admin_only: "Sehemu hii ni ya wasimamizi pekee.",
  },

  /* ================================= ENGLISH ============================== */
  en: {
    /* ------------------------------- General ------------------------------ */
    app_hello: "Hello! 👋",
    app_welcome: "Welcome to Ujani — fast and easy service.",
    menu_button: "Open",
    back_to_menu: "🔙 Back to menu",
    thanks: "Thank you! 🙏",
    invalid_choice: "Sorry, that’s not a valid choice. Please try again.",
    try_again: "Please try again shortly.",
    say_next: "Send *next* to see more.",
    yes: "Yes",
    no: "No",

    /* -------------------------------- Menu -------------------------------- */
    menu_body: "Hello! 👋\nHow can we help today? Choose below.",
    section_products: "🛍️ Products",
    section_help: "🆘 Help",
    section_settings: "⚙️ Settings",
    talk_agent_title: "👨‍💼 Talk to Agent",
    talk_agent_desc: "Get help from a human",
    track_order_title: "📦 Track Order",
    track_order_desc: "Check your order status",

    /* ------------------------------- Products ------------------------------ */
    products_title: "🛍️ Our Products",
    products_pick: "Pick a product or ask a question.",
    product_more_details: "ℹ️ More details",
    product_add_to_cart: "➕ Add to cart",
    product_buy_now: "⚡ Buy now",

    /* -------- Aliases often used in menus (don’t break old references) ----- */
    btn_more_details: "ℹ️ More details",
    btn_add_to_cart: "➕ Add to cart",
    btn_buy_now: "⚡ Buy now",

    /* ==================== UJANI — TOPICAL (KIBOKO) ======================== */
    product_kiboko_title: "Ujani — Topical (Kiboko)",
    kiboko_title: "Ujani — Topical (Kiboko)",
    product_kiboko_tagline: "For quick enhancement results — apply on. 🧴🚀",
    product_kiboko_price_label: "Price: TZS {price}",
    // English rendering relative to your Swahili copy
    product_kiboko_points: [
      "🚀 If you want fast enhancement results (beyond “Nchi Saba”), use Ujani Kiboko.",
      "🧴 This product is topical (apply on).",
      "📏 Formulated so that someone at “Nchi Tatu” can reach “Nchi Saba” and beyond.",
      "✅ The results are presented as reliable and long-lasting.",
      "⏱️ Suitable whether the concern is long-term or short-term; designed not to be hindered by typical factors.",
      "🧬 Built with ingredients aligned to the body’s natural hormones.",
      "📆 Course is 21 days; results are indicated within 14 days.",
      "🚚 We deliver inside and outside the country.",
      "📄 Usage instructions are included with your product."
    ],

    /* ==================== UJANI — ORAL (FURAHA) =========================== */
    product_furaha_title: "Ujani — Oral (Furaha)",
    furaha_title: "Ujani — Oral (Furaha)",
    product_furaha_tagline: "“Furaha ya ndoa” oral formula — firmness & stamina. 🍵💪",
    product_furaha_price_label: "Price: TZS {price}",
    product_furaha_points: [
      "🍵 An oral product — the “furaha ya ndoa” formula — to help strengthen penile muscles and support firmness.",
      "🩸 Supports easier blood flow to the penis.",
      "🔥 Can increase sexual desire or sperm production (quantity and fertilization capability), per product description.",
      "⏱️ Aims to help sustain intercourse for a longer duration (~45+ minutes) and link the first and second rounds.",
      "🥄 Directions: two teaspoons in the morning, two at noon, and two in the evening.",
      "🛡️ Also noted as helpful for those affected by excessive masturbation.",
      "🚚 Delivery available inside and outside the country; instructions are included."
    ],

    /* --------------------------- Catalog: Pro Max -------------------------- */
    product_promax_title: "Pro Max",
    promax_title: "Pro Max",
    product_promax_tagline: "Top-tier service for heavy-duty needs 🚀",
    product_promax_desc: [
      "📦 High-end package with enhanced features.",
      "🧑‍🔧 Priority support and follow-up.",
      "📈 Ideal for businesses / high-demand sites."
    ],
    product_promax_a_title: "Pro Max A",
    product_promax_a_points: [
      "✅ Core Pro Max features",
      "🕒 Streamlined service schedule",
      "💬 Priority assistance"
    ],
    product_promax_b_title: "Pro Max B",
    product_promax_b_points: [
      "➕ More features than A",
      "🛠️ Extra checks/alerts",
      "📊 Short performance report"
    ],
    product_promax_c_title: "Pro Max C",
    product_promax_c_points: [
      "🏆 Full Pro Max bundle",
      "🧪 Deep inspection + follow-up",
      "📞 Extended priority support"
    ],
    product_promax_price_label: "Price: TZS {price}",

    /* ---------------------------- Parcels / Packages ----------------------- */
    parcel_small_title: "Small Parcel",
    parcel_small_desc: "For small/light orders 📦",
    parcel_medium_title: "Medium Parcel",
    parcel_medium_desc: "Balanced cost and capacity 📦📦",
    parcel_large_title: "Large Parcel",
    parcel_large_desc: "For big/heavy orders 📦📦📦",

    /* -------------------------------- Cart -------------------------------- */
    cart_empty: "🧺 Your cart is empty.",
    cart_summary_title: "🧺 Cart Summary",
    cart_summary_line: "• {title} ×{qty} — {price}",
    cart_summary_total: "Total: {total}",
    cart_actions: "Choose what to do with your cart:",
    btn_cart_checkout: "✅ Checkout",
    btn_cart_clear: "🧹 Clear cart",
    btn_cart_back: "🔙 Back to menu",

    /* ----------------------------- Fulfillment ---------------------------- */
    choose_fulfillment: "How would you like to get your order? 🚚🏢",
    btn_pickup: "🏢 Pick up at office",
    btn_delivery: "🚚 Delivery",

    /* --------------------------- Customer details ------------------------- */
    ask_name: "Please share your *full name* 🙏",
    ask_delivery_phone: "Enter the phone number to receive the package ☎️",
    ask_address: "Type your *full address* (street/building, etc.) 🏠",

    /* -------------------------- Smart Delivery (NEW) ---------------------- */
    pick_district_title: "Choose District 🗺️",
    pick_district_body: "Please choose your district to begin.",
    pick_ward_title: "Choose Ward 📍",
    pick_ward_body: "Pick your ward to estimate distance & fee.",
    pick_street_title: "Choose Street (optional) 🧭",
    pick_street_body: "For a more accurate fee, pick your street or *share your Location*.",
    pick_street_skip: "⏭️ Skip street",
    pick_street_share_location: "📡 Share Location",
    street_page_more: "List continues… reply with a number or send *next*.",
    street_selected: "✅ {ward} — selected: {street}.",
    street_skipped: "⏭️ {ward} — street skipped; using ward distance.",
    send_location_hint: "Please share your *WhatsApp Location*.",
    delivery_quote: "📏 Distance used: ~{km} km\n💵 Delivery fee: TZS {fee}",

    /* -------------------------------- Summary ----------------------------- */
    summary_title: "📦 Order Summary",
    summary_address: "Area: {district}, {ward}{street_line}",
    summary_street_line: ", {street}",
    summary_delivery_fee: "Delivery: TZS {fee}",
    summary_total: "Total: TZS {total}",
    summary_confirm: "Confirm to proceed ✅",

    /* -------------------------------- Payment ----------------------------- */
    pay_title: "💳 Payment",
    pay_instructions:
      "Please pay a total of *TZS {amount}*.\nOnce paid, send a message or *attach proof* here.",
    pay_attach_proof: "📎 Please attach a receipt/screenshot.",
    pay_received_full: "✅ Payment received in full. Thank you!",
    pay_received_partial:
      "ℹ️ We received *TZS {amount}*. Balance due: *TZS {balance}*.",
    pay_reference_prompt: "Share the *transaction reference* or attach a receipt.",
    balance_due: "Balance due: *TZS {balance}*",

    /* ------------------------------ Order status -------------------------- */
    order_status_prefix: "Order {orderId} status:",
    order_pending: "⌛ Pending payment/confirmation.",
    order_paid: "✅ Paid, awaiting dispatch.",
    order_enroute: "🚚 On the way to you.",
    order_delivered: "📬 Delivered. Thanks for shopping!",
    order_ref: "Reference: {orderId}",

    /* ------------------------------ Human handoff ------------------------- */
    agent_handoff_intro:
      "👨‍💼 Want to talk to a human agent? Choose *Talk to Agent*.",
    agent_handoff_confirm: "You’re connected to an agent. 🤝",
    agent_resume_bot: "Bot has been resumed. 🤖",

    /* --------------------------------- Admin ------------------------------ */
    admin_only: "This area is for admins only.",
  }
};

export default dict;
