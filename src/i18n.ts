// src/i18n.ts
// Bilingual strings (Swahili/English) + tiny emoji polish.
// Use: t(lang, 'key', { param: 'value' })

export type Lang = "sw" | "en";
type Dict = Record<string, string>;

export const i18n: Record<Lang, Dict> = {
  /* ============================== KISWAHILI ============================== */
  sw: {
    /* App / common */
    app_name: "UJANI",
    hello: "Habari! 👋",
    ok: "Sawa ✅",
    yes: "Ndiyo",
    no: "Hapana",
    open: "Fungua",
    back: "🔙 Rudi",
    back_menu: "🔙 Rudi menyu",
    invalid_choice: "⚠️ Samahani, chaguo si sahihi. Jaribu tena.",
    invalid_text: "⚠️ Tafadhali tuma maandishi sahihi.",

    /* Main menu */
    menu_body: "UJANI\nTunawezaje kukusaidia leo? Chagua chaguo hapa chini. ⬇️",
    menu_button: "Fungua",
    section_products: "🛍️ Bidhaa",
    section_help: "🆘 Msaada",
    section_settings: "⚙️ Mipangilio",

    /* Products list */
    products_title: "Bidhaa",
    products_pick: "Chagua bidhaa unayohitaji. 🛍️",

    /* Product titles / taglines */
    product_kiboko_title: "Ujani Kiboko — Kiboko ya Kibamia",
    product_kiboko_tagline: "Ya kupaka • TSh 140,000",
    product_furaha_title: "Ujani Furaha ya Ndoa",
    product_furaha_tagline: "Ya kunywa • TSh 110,000",
    product_promax_a_title: "Ujani Pro Max — A",
    product_promax_b_title: "Ujani Pro Max — B",
    product_promax_c_title: "Ujani Pro Max — C",
    product_promax_tagline: "A/B/C • TSh 350,000",

    /* Product details (bullets) */
    product_kiboko_points:
      [
        "Kama unahitaji matokeo ya haraka kwaajili ya kukuza na kunenepesha zaidi ya Nchi Saba tumia Ujani — Kiboko ya Kibamia. 💪",
        "Dawa hii ni ya *kupaka*.",
        "Imetengenezwa ili hata mtu mwenye urefu wa Nchi tatu afike Nchi Saba na zaidi.",
        "Matokeo ni ya *uhakika* na ya *kudumu*.",
        "Haichagui kama ni tatizo la muda mrefu au muda mfupi — bado inafanya kazi. ⏱️",
        "Ingredients zimezingatia *hormones* zilizopo mwilini.",
        "Matumizi ni *siku 21*; matokeo ndani ya *siku 14* mara nyingi.",
        "Delivery ndani na nje ya Nchi tunafanya.",
        "Maelekezo ya matumizi yameainishwa kwenye dawa yako. 📦",
      ].join("\n"),
    product_furaha_points:
      [
        "Husaidia kuimarisha *misuli ya uume* na kuufanya kuwa *imara zaidi*. 💪",
        "Huboresha *mzunguko wa damu* kwenye uume.",
        "Huongeza *hamu ya tendo la ndoa* na uzalishaji wa mbegu nyingi zenye uwezo wa kutungisha mimba.",
        "Husaidia kumudu tendo la ndoa kwa muda mrefu — hadi *dakika 45+* na kuunganisha bao la kwanza na la pili. ⏳",
        "Dozi: *vijiko viwili* asubuhi, *viwili* mchana, na *viwili* jioni.",
        "Ni nzuri pia kwa waathirika wa *punyeto*.",
      ].join("\n"),
    product_promax_a_points:
      [
        "Toleo A la Ujani Pro Max.",
        "Muundo ulioboreshwa kwa ufanisi wa haraka.",
        "Tathmini ya usalama na maelekezo kamili kwenye kifurushi.",
      ].join("\n"),
    product_promax_b_points:
      [
        "Toleo B la Ujani Pro Max.",
        "Linalenga uimara na uendelevu wa matokeo.",
        "Maelekezo ya matumizi yapo kwenye kifurushi.",
      ].join("\n"),
    product_promax_c_points:
      [
        "Toleo C la Ujani Pro Max.",
        "Chaguo mbadala kulingana na mahitaji ya mtumiaji.",
        "Soma maelekezo kabla ya kutumia.",
      ].join("\n"),

    /* Product actions */
    btn_add_to_cart: "➕ Ongeza Kikapuni",
    btn_buy_now: "🛒 Nunua sasa",
    back_to_menu: "🔙 Rudi menyu",

    /* Cart */
    cart_empty: "🧺 Kikapu chako ni tupu kwa sasa.",
    cart_summary_title: "🧺 Muhtasari wa Kikapu",
    cart_summary_line: "• {title} ×{qty} — TSh {price}",
    cart_summary_total: "Jumla: *TSh {total}*",
    cart_actions: "Chagua hatua ifuatayo.",
    btn_cart_checkout: "✅ Endelea na malipo",
    btn_cart_back: "🔙 Rudi Bidhaa",

    /* Fulfillment */
    choose_fulfillment: "Ungependa *kukusanya* mwenyewe au tufanye *delivery*? 🚚",
    btn_pickup: "Chukua mwenyewe",
    btn_delivery: "Delivery",

    /* Contact / phone */
    ask_delivery_phone: "Weka *namba ya simu* ya kupokelea mzigo. ☎️",

    /* Location pickers (district/ward/street) */
    pick_district_title: "Wilaya",
    pick_district_body: "Chagua *wilaya* yako. 🏙️",
    pick_ward_title: "Ward",
    pick_ward_body: "Chagua *ward* uliyo karibu zaidi. 📍",
    pick_street_body:
      "Chagua *mtaa* (au tuma *location*). Unaweza pia kuandika jina la mtaa moja kwa moja. 🏷️",
    street_selected: "✅ *{ward}* — *{street}* imechaguliwa.",
    street_skipped: "⏭️ Umeruka mtaa kwa *{ward}*.",
    send_location_hint:
      "Tuma *location* ya Whatsapp (📎 ➜ Location) ili tutathmini umbali kwa usahihi. 🗺️",

    /* Smart delivery quote */
    delivery_quote: "🚚 Gharama ya delivery: ~{km} km ➜ *TSh {fee}*",

    /* NEW – Order flow per your request (Full name → Inside Dar → Phone → Address) */
    ask_full_name: "Tuma *majina matatu kamili* ya mteja. 🧾",
    ask_in_out_dar:
      "Je, uko *ndani ya Dar es Salaam* au *nje ya Dar es Salaam*? 🚚",
    btn_inside_dar: "Ndani ya Dar es Salaam",
    btn_outside_dar: "Nje ya Dar es Salaam",
    ask_phone_in_dar: "Weka *namba ya simu* ya kupokelea mzigo. ☎️",
    ask_address_in_dar:
      "Weka *anuani ya Dar* kwa *format*: *mtaa/eneo, wilaya* — mfano: *Kariakoo, Ilala*. 🏷️\n• Kwanza: mtaa/eneo (au ward)\n• Pili: wilaya (Ilala, Kinondoni, Temeke, Kigamboni, Ubungo)",
    invalid_address_format:
      "⚠️ Tumia format *mtaa/eneo, wilaya* (mfano: *Kariakoo, Ilala*).",
    delivery_quote_title: "📦 Muhtasari wa Delivery",
    delivery_quote_line:
      "📍 *Mahali*: {place}\n📏 *Umbali*: ~{km} km\n💵 *Gharama*: TSh {fee}",
    delivery_unknown:
      "⚠️ Hatukuweza kuthibitisha umbali. Taja *mtaa/eneo, wilaya* (mfano: *Kariakoo, Ilala*).",

    /* Outside Dar */
    ask_region_outside:
      "Taja *mkoa* uliopo. 🗺️ (Tutakutumia makadirio ya gharama kwa nje ya Dar.)",

    /* Language */
    switch_to_english: "Switch to English 🇬🇧",
    switch_to_swahili: "Rudi Kiswahili 🇹🇿",
  },

  /* ================================ ENGLISH ================================ */
  en: {
    /* App / common */
    app_name: "UJANI",
    hello: "Hello! 👋",
    ok: "Okay ✅",
    yes: "Yes",
    no: "No",
    open: "Open",
    back: "🔙 Back",
    back_menu: "🔙 Back to menu",
    invalid_choice: "⚠️ Sorry, that’s not a valid choice. Please try again.",
    invalid_text: "⚠️ Please send valid text.",

    /* Main menu */
    menu_body:
      "UJANI\nHow can we help you today? Choose an option below. ⬇️",
    menu_button: "Open",
    section_products: "🛍️ Products",
    section_help: "🆘 Help",
    section_settings: "⚙️ Settings",

    /* Products list */
    products_title: "Products",
    products_pick: "Pick the product you need. 🛍️",

    /* Product titles / taglines */
    product_kiboko_title: "Ujani Kiboko — ‘Kiboko ya Kibamia’",
    product_kiboko_tagline: "Topical • TSh 140,000",
    product_furaha_title: "Ujani Furaha ya Ndoa",
    product_furaha_tagline: "Drinkable • TSh 110,000",
    product_promax_a_title: "Ujani Pro Max — A",
    product_promax_b_title: "Ujani Pro Max — B",
    product_promax_c_title: "Ujani Pro Max — C",
    product_promax_tagline: "A/B/C • TSh 350,000",

    /* Product details (bullets) */
    product_kiboko_points:
      [
        "If you need fast results to increase size beyond seven inches, use Ujani — ‘Kiboko ya Kibamia’. 💪",
        "This is a *topical* product (applied on skin).",
        "Formulated so even someone at three inches can reach seven and above.",
        "Results are *reliable* and *long-lasting*.",
        "Works for both long-standing and recent issues. ⏱️",
        "Ingredients align with the body’s *hormones*.",
        "Use for *21 days*; results often visible within *14 days*.",
        "We deliver inside and outside the country.",
        "Usage instructions are included in your package. 📦",
      ].join("\n"),
    product_furaha_points:
      [
        "Helps strengthen *penile muscles* and improve firmness. 💪",
        "Improves *blood circulation* in the penis.",
        "Boosts *libido* and sperm production with better fertility potential.",
        "Helps you last longer — *45+ minutes* and combine round one and two. ⏳",
        "Dosage: *two teaspoons* morning, *two* at noon, and *two* in the evening.",
        "Also supportive for those affected by *masturbation* side effects.",
      ].join("\n"),
    product_promax_a_points:
      [
        "Ujani Pro Max — Variant A.",
        "Optimized formulation for fast effectiveness.",
        "Full safety notes and instructions in the package.",
      ].join("\n"),
    product_promax_b_points:
      [
        "Ujani Pro Max — Variant B.",
        "Aims for stronger and longer-lasting results.",
        "Follow the included instructions before use.",
      ].join("\n"),
    product_promax_c_points:
      [
        "Ujani Pro Max — Variant C.",
        "Alternative profile depending on user needs.",
        "Please read instructions before use.",
      ].join("\n"),

    /* Product actions */
    btn_add_to_cart: "➕ Add to cart",
    btn_buy_now: "🛒 Buy now",
    back_to_menu: "🔙 Back to menu",

    /* Cart */
    cart_empty: "🧺 Your cart is empty.",
    cart_summary_title: "🧺 Cart summary",
    cart_summary_line: "• {title} ×{qty} — TSh {price}",
    cart_summary_total: "Total: *TSh {total}*",
    cart_actions: "Choose the next action.",
    btn_cart_checkout: "✅ Checkout",
    btn_cart_back: "🔙 Back to products",

    /* Fulfillment */
    choose_fulfillment: "Would you like *pickup* or *delivery*? 🚚",
    btn_pickup: "Pickup",
    btn_delivery: "Delivery",
    ask_delivery_phone: "Enter the *phone number* for delivery. ☎️",

    /* Location pickers (district/ward/street) */
    pick_district_title: "District",
    pick_district_body: "Choose your *district*. 🏙️",
    pick_ward_title: "Ward",
    pick_ward_body: "Choose the nearest *ward*. 📍",
    pick_street_body:
      "Choose the *street* (or send your *location*). You may also type the street name. 🏷️",
    street_selected: "✅ *{ward}* — *{street}* selected.",
    street_skipped: "⏭️ You skipped street for *{ward}*.",
    send_location_hint:
      "Send a WhatsApp *location* (📎 ➜ Location) so we can measure distance accurately. 🗺️",

    /* Smart delivery quote */
    delivery_quote: "🚚 Delivery charge: ~{km} km ➜ *TSh {fee}*",

    /* NEW – Order flow (Full name → Inside Dar → Phone → Address) */
    ask_full_name: "Send the customer's *full name (three names)*. 🧾",
    ask_in_out_dar:
      "Are you *inside Dar es Salaam* or *outside Dar es Salaam*? 🚚",
    btn_inside_dar: "Inside Dar es Salaam",
    btn_outside_dar: "Outside Dar es Salaam",
    ask_phone_in_dar: "Enter the *phone number* for delivery. ☎️",
    ask_address_in_dar:
      "Send your *Dar address* in the format *area/street, district* — e.g. *Kariakoo, Ilala*. 🏷️",
    invalid_address_format:
      "⚠️ Use the format *area/street, district* (e.g. *Kariakoo, Ilala*).",
    delivery_quote_title: "📦 Delivery Summary",
    delivery_quote_line:
      "📍 *Place*: {place}\n📏 *Distance*: ~{km} km\n💵 *Charge*: TSh {fee}",
    delivery_unknown:
      "⚠️ Couldn’t resolve your distance. Please send *area/street, district* (e.g. *Kariakoo, Ilala*).",

    /* Outside Dar */
    ask_region_outside:
      "Tell us your *region*. 🗺️ (We’ll share an estimate for outside Dar.)",

    /* Language */
    switch_to_english: "Switch to English 🇬🇧",
    switch_to_swahili: "Back to Kiswahili 🇹🇿",
  },
};

/** Tiny templating helper */
export function t(
  lang: Lang,
  key: keyof typeof i18n["sw"],
  params?: Record<string, string | number>
): string {
  const dict = i18n[lang] || i18n.sw;
  const template = (dict[key] ?? i18n.en[key] ?? key) as string;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ""));
}
