// src/i18n.ts
import { Lang } from './session.js';

type Dict = Record<Lang, Record<string, string>>;

const dict: Dict = {
  sw: {
    // Main menu
    menu_body: "Tunawezaje kukusaidia leo?\nChagua chaguo hapa chini.",
    menu_button: "Fungua",
    section_products: "Bidhaa",
    section_help: "Msaada",
    section_settings: "Mipangilio",
    track_order_title: "Fuatilia Oda",
    track_order_desc: "Angalia hali ya oda yako",
    talk_agent_title: "Ongea na Wakala",
    talk_agent_desc: "Chagua njia ya kuwasiliana",
    change_lang_title: "Badili Lugha",
    change_lang_desc: "Chagua Kiswahili au Kiingereza",

    // Language
    change_lang_prompt: "Chagua lugha:",
    lang_sw: "Kiswahili",
    lang_en: "English",
    lang_changed_to: "Lugha imebadilishwa kuwa: {lang}",

    // Pro Max
    promax_pick_package: "Ujani Pro Max — chagua pakiti A, B au C.",
    section_promax: "Pakiti za Pro Max",
    promax_note_bottom: "Bei jumla {price}. Chagua pakiti yako, kisha kamilisha oda.",

    // Product actions (shown via LIST so we can have 3+ rows)
    product_actions_body_prefix: "Umechagua:",
    opt_section: "Chaguo",
    row_buy: "Nunua sasa",
    row_info: "Maelezo zaidi",
    row_add: "Ongeza kikapuni",
    row_view_cart: "Angalia kikapu",
    row_back_menu: "Rudi menyu",

    // Cart
    cart_added: "✅ *{title}* limeongezwa kwenye kikapu.",
    cart_empty: "🧺 Kikapu chako kipo tupu.",
    cart_summary_header: "🧺 Kikapu chako:",
    cart_summary_line: "• {title} ×{qty} — {price}",
    cart_summary_total: "Jumla: {total}",
    cart_actions: "Chagua hatua kwa kikapu:",
    btn_cart_checkout: "Kamilisha oda",
    btn_cart_clear: "Futa kikapu",
    btn_cart_back: "Rudi menyu",

    // Fulfillment choice
    choose_fulfillment: "Ungependa kuipata vipi bidhaa?",
    btn_pickup: "Chukua ofisini",
    btn_delivery: "Letewa (Delivery)",

    // Product details (bullets)
    kiboko_more_bullets: [
      "• Kama unahitaji matokeo ya haraka kwa ajili ya kukuza na kunenepesha zaidi ya nchi saba, tumia *Ujani Kiboko ya Kibamia*.",
      "• Dawa hii ni ya kupaka.",
      "• Imetengenezwa walau mtu mwenye urefu wa nchi tatu afike nchi saba na zaidi.",
      "• Matokeo ya dawa hii ni ya uhakika na ya kudumu.",
      "• Haichagui kama ni tatizo la muda mrefu au la muda mfupi; hakuna kikwazo kitakachopelekea dawa kushindwa kufanya kazi.",
      "• Sababu: zimetengenezwa kwa kuzingatia viambato vinavyoendana na hormones zilizopo mwilini.",
      "• Matumizi ni ya siku 21; matokeo ndani ya siku ~14.",
      "• Tunafanya delivery ndani na nje ya nchi.",
      "• Matumizi yameainishwa kwenye dawa yako."
    ].join("\n"),
    furaha_more_bullets: [
      "• *Furaha ya Ndoa* (dawa ya kunywa) huimarisha misuli ya uume na kufanya uume kuwa imara zaidi.",
      "• Huarahisisha mzunguko wa damu kwenye uume.",
      "• Huongeza hamu ya tendo la ndoa na/au uzalishaji wa mbegu zenye uwezo wa kutungisha mimba.",
      "• Husaidia kudumu muda mrefu — dakika ~45+ na kuunganisha bao la kwanza na la pili.",
      "• Matumizi: vijiko viwili asubuhi, viwili mchana, viwili jioni.",
      "• Pia ni nzuri kwa waathirika wa punyeto."
    ].join("\n"),
    promax_detail_promax_a: "Kipakeji hiki kina dawa tatu za kunywa ambacho bei yake ni TSh 350,000.",

    // Checkout (name + structured address + phone)
    ask_full_name: "Weka *jina kamili* litakalotumika kwenye oda (jina 1/2/3 linafaa).",
    ask_address_structured:
      "Weka *anuani yako* kwa mtiririko: *mtaa/barabara, jiji/mji, nchi* (mfano: Keko Furniture, Dar es Salaam, Tanzania).",
    address_invalid:
      "Tafadhali andika anuani kwa muundo: *mtaa/barabara, jiji/mji, nchi* (mfano: Keko Furniture, Dar es Salaam, Tanzania).",
    ask_phone: "Weka namba ya simu inayopatikana sasa (mfano: +2557XXXXXXXX au 07XXXXXXX).",
    phone_invalid: "Hiyo si namba sahihi. Tafadhali jaribu tena (mfano: +2557XXXXXXXX au 07XXXXXXX).",
    // Checkout — area choice
    choose_area: "Je, uko *ndani ya Dar es Salaam* au *nje ya Dar es Salaam*?",
    btn_area_dar: "Ndani ya Dar es Salaam",
    btn_area_outside: "Nje ya Dar es Salaam",
    // Order summaries
    // Dar inside
    prompt_dar_pick_or_deliver: "Unataka nini?",
    // Outside Dar
    prompt_region: "Taja *mkoa (region)* uliopo.",
    prompt_transport_mode: "Chagua *aina ya usafiri*: Basi au Boti.",
    btn_mode_bus: "Basi",
    btn_mode_boat: "Boti",
    prompt_transport_name: "Taja *jina la {mode}* (mf. Aboud).",
    prompt_station: "Taja *kituo/stendi* unachopendelea (mf. Kisamvu, Morogoro).",
    outside_summary:
  "📦 *Muhtasari (Nje ya Dar)*\nJina: {name}\nMkoa: {region}\nUsafiri: {mode} - {tname}\nKituo: {station}\nNauli: {fee}\nJumla: {total}",   
    prompt_fullname: "Tuma *majina matatu kamili* ya mpokeaji/mteja.",
    prompt_ward_district: "Taja *ward na district* (mf. \"tabata kimanga ilala\" au \"pemba mnazi kigamboni\").",
    dar_delivery_summary:
  "📦 *Muhtasari (Delivery Dar)*\nJina: {name}\nMahali: {ward}, {district}\nUmbali: {km} km\nNauli: {fee}\nJumla: {total}",
    order_created_title: "Muhtasari wa Oda",
    order_created_body_single:
      "Oda yako ya *{title}* ya *{total}* imehifadhiwa.\n" +
      "*Jina:* {customerName}\n" +
      "*Anuani:* {street} {city} {country}\n\n" +
      "Unaweza *Hariri anwani* au *Lipia sasa* hapa chini.",
    order_created_body_total:
      "Oda yako ya *kiasi {total}* imehifadhiwa.\n" +
      "*Jina:* {customerName}\n" +
      "*Anuani:* {street} {city} {country}\n\n" +
      "Unaweza *Hariri anwani* au *Lipia sasa* hapa chini.",
    prompt_new_address: "Weka anuani mpya: *mtaa/barabara, jiji/mji, nchi*.",
    address_updated: "Anuani imesasishwa: {street} {city} {country}",
    order_next_actions: "Chagua hatua ifuatayo:",
    btn_pay_now: "Tuma ushahidi wa malipo",

    btn_edit_address: "Hariri anwani",
    btn_back_menu: "Rudi menyu",

    // Pickup completion
    pickup_thanks: "habar ndugu {customerName} karibu ofisini kwetu iliopo keko furniture karibu na omax bar.",

    // Transactions
    prompt_txn_message:
      "Tafadhali tuma *majina matatu kamili ya mlipaji*, *kiasi*, *muda* ulipolipa AU tuma *screenshot* ya uthibitisho. (Taja pia *OrderID {orderId}* kwenye meseji).",
    txn_processing_ack: "Inachakata subir baada ya muda mfupi 🙏",

    // Tracking
    prompt_order_id: "Tafadhali andika *OrderID* (mfano: UJANI-2025-0001).",
    status_not_found: "Samahani, hatukupata oda hiyo.",
    status_card:
      "*Oda:* {orderId}\n*Kichwa:* {title}\n*Jumla:* {total}\n*Hali ya sasa:* {status}\n*Uliolipa:* {paid}\n*Baki:* {balance}",

    status_awaiting: "Inasubiri malipo",
    status_partial: "Malipo ya sehemu",
    status_paid: "Imelipwa kikamilifu",

    // Proof (button label reworded away from integrations


    // Agent (as interactive list)
    agent_contact_question: "Ungependa kuwasiliana na wakala kwa njia ipi?",
    agent_list_title: "Wasiliana na Wakala",
    agent_row_text: "Ujumbe (WhatsApp)",
    agent_row_wa_call: "WhatsApp Call",
    agent_row_normal_call: "Simu ya kawaida",
    agent_text_ack: "Sawa! Tuma ujumbe wako hapa WhatsApp — tupo tayari kukusaidia.",
    agent_wa_call_ack: "Tutakupigia kwenye WhatsApp muda si mrefu 🙏",
    agent_prompt_phone: "Weka namba ya simu inayopatikana sasa (mfano: 2557XXXXXXX au 07XXXXXXX).",
    agent_phone_ack: "Tutakupigia sasa hivi kwenye: {phone}. Asante!",
    agent_phone_invalid: "Hiyo siyo namba sahihi. Jaribu tena (mfano: 2557XXXXXXX au 07XXXXXXX).",

    // Generic
    not_found: "Samahani, haijapatikana.",
  },

  en: {
    // Main menu
    menu_body: "How can we help today?\nChoose an option below.",
    menu_button: "Open",
    section_products: "Products",
    section_help: "Help",
    section_settings: "Settings",
    track_order_title: "Track Order",
    track_order_desc: "Check your order status",
    talk_agent_title: "Talk to an Agent",
    talk_agent_desc: "Choose how to contact us",
    change_lang_title: "Change Language",
    change_lang_desc: "Switch to Swahili or English",

    // Language
    change_lang_prompt: "Choose language:",
    lang_sw: "Kiswahili",
    lang_en: "English",
    lang_changed_to: "Language changed to: {lang}",

    // Pro Max
    promax_pick_package: "Ujani Pro Max — choose package A, B, or C.",
    section_promax: "Pro Max Packages",
    promax_note_bottom: "Total {price}. Pick your package, then continue to order.",

    // Product actions
    product_actions_body_prefix: "You selected:",
    opt_section: "Options",
    row_buy: "Buy now",
    row_info: "More info",
    row_add: "Add to cart",
    row_view_cart: "View cart",
    row_back_menu: "Back to menu",

    // Cart
    cart_added: "✅ *{title}* added to your cart.",
    cart_empty: "🧺 Your cart is empty.",
    cart_summary_header: "🧺 Your cart:",
    cart_summary_line: "• {title} ×{qty} — {price}",
    cart_summary_total: "Total: {total}",
    cart_actions: "Choose a cart action:",
    btn_cart_checkout: "Checkout",
    btn_cart_clear: "Clear cart",
    btn_cart_back: "Back to menu",

    // Fulfillment choice
    choose_fulfillment: "How would you like to receive the product?",
    btn_pickup: "Pick up at office",
    btn_delivery: "Get it delivered",

    // Product details (EN)
    kiboko_more_bullets: [
      "• If you need fast results to increase length and girth beyond seven inches, use *Ujani Kiboko ya Kibamia*.",
      "• This is a topical medicine (apply on skin).",
      "• Designed to help someone from about three inches reach seven inches and beyond.",
      "• Results are reliable and long-lasting.",
      "• Works for both long-term and short-term issues; no blockers preventing effectiveness.",
      "• Reason: formulated with ingredients aligned to the body’s natural hormones.",
      "• A 21-day regimen; results usually within ~14 days.",
      "• We deliver inside and outside Tanzania.",
      "• Usage instructions are provided with your medicine."
    ].join("\n"),
    furaha_more_bullets: [
      "• *Furaha ya Ndoa* (oral medicine) helps strengthen penile muscles and increase firmness.",
      "• Improves blood circulation to the penis.",
      "• Boosts libido and supports sperm quality and quantity for fertility.",
      "• Helps endurance — about 45+ minutes and the ability to combine first and second rounds.",
      "• Dosage: two teaspoons morning, two at noon, and two in the evening.",
      "• Also helpful for those affected by frequent masturbation."
    ].join("\n"),
    promax_detail_promax_a: "This package contains three oral medicines. Price is TSh 350,000.",

    // Checkout (name + structured address + phone)
    ask_full_name: "Enter your *full name* to use on the order (one, two, or three names are fine).",
    ask_address_structured:
      "Enter your *address* as: *street(s), city, country* (e.g., Keko Furniture, Dar es Salaam, Tanzania).",
    address_invalid:
      "Please type your address in the form: *street(s), city, country* (e.g., Keko Furniture, Dar es Salaam, Tanzania).",
    ask_phone: "Enter a phone number we can reach you on now (e.g., +2557XXXXXXXX or 07XXXXXXXX).",
    phone_invalid: "That phone number doesn’t look valid. Please try again (e.g., +2557XXXXXXXX or 07XXXXXXXX).",

    // Order summaries
    order_created_title: "Order Summary",
    order_created_body_single:
      "Your order for *{title}* of *{total}* has been saved.\n" +
      "*Name:* {customerName}\n" +
      "*Address:* {street} {city} {country}\n\n" +
      "You can *Edit address* or *Pay now* below.",
    order_created_body_total:
      "Your order totaling *{total}* has been saved.\n" +
      "*Name:* {customerName}\n" +
      "*Address:* {street} {city} {country}\n\n" +
      "You can *Edit address* or *Pay now* below.",
    prompt_new_address: "Enter a new address: *street(s), city, country*.",
    address_updated: "Address updated: {street} {city} {country}",
    order_next_actions: "Choose your next step:",
    btn_pay_now: "Pay now",
    btn_edit_address: "Edit address",
    btn_back_menu: "Back to menu",

    // Pickup completion
    pickup_thanks: "Hello {customerName}, you’re welcome to our office located at Keko Furniture near Omax Bar.",

    // Transactions
    prompt_txn_message:
  "Please send the *payer’s three full names*, *amount*, and *time*, OR send a *screenshot* of the confirmation. (Include *OrderID {orderId}* in the message).",
    txn_processing_ack: "Processing — please wait a moment 🙏",

    // Tracking
    prompt_order_id: "Please enter your *OrderID* (e.g., UJANI-2025-0001).",
    status_not_found: "Sorry, we couldn’t find that order.",
    status_card:
      "*Order:* {orderId}\n*Title:* {title}\n*Total:* {total}\n*Status:* {status}\n*Paid:* {paid}\n*Balance:* {balance}",

    status_awaiting: "Awaiting payment",
    status_partial: "Partial payment",
    status_paid: "Paid in full",

    // Agent (interactive list)
    agent_contact_question: "How would you like to contact an agent?",
    agent_list_title: "Contact an Agent",
    agent_row_text: "Via text (WhatsApp)",
    agent_row_wa_call: "Via WhatsApp Call",
    agent_row_normal_call: "Via normal call",
    agent_text_ack: "Great! Send us messages here on WhatsApp — we’re ready to assist.",
    agent_wa_call_ack: "We’ll call you on WhatsApp shortly 🙏",
    agent_prompt_phone: "Please enter a phone number that is currently reachable; we’ll call you.",
    agent_phone_ack: "We’ll call you now on: {phone}. Thank you!",
    agent_phone_invalid: "That doesn’t look like a valid phone number. Please try again (e.g., 2557XXXXXXXX or 07XXXXXXXX).",

    not_found: "Sorry, not found.",
    choose_area: "Are you *within Dar es Salaam* or *outside Dar es Salaam*?",
btn_area_dar: "Within Dar es Salaam",
btn_area_outside: "Outside Dar es Salaam",

prompt_dar_pick_or_deliver: "How would you like to receive it?",

prompt_fullname: "Send the *full name (three parts)* of the receiver/customer.",
prompt_ward_district: "Type *ward + district* (e.g., \"tabata kimanga ilala\" or \"kivukoni ilala\").",
dar_delivery_summary:
  "📦 *Summary (Dar Delivery)*\nName: {name}\nPlace: {ward}, {district}\nDistance: {km} km\nDelivery: {fee}\nTotal: {total}",

prompt_region: "Type your *region*.",
prompt_transport_mode: "Choose *transport type*: Bus or Boat.",
btn_mode_bus: "Bus",
btn_mode_boat: "Boat",
prompt_transport_name: "Type the *{mode} name* (e.g., Aboud).",
prompt_station: "Type the *preferred station* (e.g., Kisamvu, Morogoro).",
outside_summary:
  "📦 *Summary (Outside Dar)*\nName: {name}\nRegion: {region}\nTransport: {mode} - {tname}\nStation: {station}\nDelivery: {fee}\nTotal: {total}",
  }
};

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

export function t(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const s = (dict[lang] && dict[lang][key]) ?? (dict.en && dict.en[key]) ?? key;
  return interpolate(s, params);
}
