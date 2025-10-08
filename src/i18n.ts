// src/i18n.ts
// Uses Lang type from session.ts and provides translations for all keys used in webhook & flows.

import type { Lang } from "./session.js";

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
    talk_agent_desc: "Pata msaada wa haraka kutoka kwa timu yetu",

    // Language (informational)
    change_lang_prompt: "Chagua lugha:",
    lang_sw: "Kiswahili",
    lang_en: "English",
    lang_changed_to: "Lugha imebadilishwa kuwa: {lang}",

    // Pro Max (descriptions referenced by product/menu helpers)
    promax_pick_package: "Ujani Pro Max — chagua pakiti A, B au C.",
    section_promax: "Pakiti za Pro Max",
    promax_note_bottom: "Bei jumla {price}. Chagua pakiti yako, kisha kamilisha oda.",

    // Product actions
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
    cart_title: "Kikapu chako",
    cart_cleared: "🧺 Kikapu kimesafishwa.",
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
    btn_back_menu: "Rudi menyu",

    // Product details (bullets)
    kiboko_more_bullets: [
      "• Kama unahitaji matokeo ya haraka kwa ajili ya kukuza na...nenepesha zaidi ya nchi saba, tumia *Ujani Kiboko ya Kibamia*.",
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

    // Address / contact
    ask_full_name: "Tuma *majina matatu kamili* ya mpokeaji/mteja.",
    ask_address_structured:
      "Weka *anuani* kama: *mtaa/mitaa, jiji, nchi* (mf. Keko Furniture, Dar es Salaam, Tanzania).",
    address_invalid:
      "Tafadhali weka anuani katika muundo: *mtaa/mitaa, jiji, nchi* (mf. Keko Furniture, Dar es Salaam, Tanzania).",
    ask_phone: "Weka namba ya simu inayopatikana sasa (mfano: +2557XXXXXXXX au 07XXXXXXXX).",
    phone_invalid: "Hiyo siyo namba sahihi. Jaribu tena (mfano: +2557XXXXXXXX au 07XXXXXXXX).",

    // Area (info)
    choose_area: "Je, uko *ndani ya Dar es Salaam* au *nje ya Dar es Salaam*?",
    btn_area_dar: "Ndani ya Dar es Salaam",
    btn_area_outside: "Nje ya Dar es Salaam",

    // Order summaries
    order_created_title: "Muhtasari wa Oda",
    order_created_body_single:
      "Oda yako ya *{title}* ya *{total}* imehifadhiwa.\n*Order ID:* {orderId}\n*Mahali:* {city} {country}\n\nUnaweza *Hariri anwani* au *Lipia sasa* hapa chini.",
    order_created_body_total:
      "Oda yako ya *kiasi {total}* imehifadhiwa.\n*Order ID:* {orderId}\n*Mahali:* {city} {country}\n\nUnaweza *Hariri anwani* au *Lipia sasa* hapa chini.",
    order_next_actions: "Chagua hatua inayofuata:",
    btn_pay_now: "Lipa sasa",
    btn_edit_address: "Hariri anwani",

    edit_address_prompt: "Weka anuani mpya: *mitaa, jiji, nchi*.",
    edit_address_ok: "Anuani imesasishwa.",

    // Pickup completion
    pickup_thanks: "Habari {customerName}, karibu ofisini kwetu Keko Furniture karibu na Omax Bar.",

    // Transactions
    prompt_txn_message:
      "Tuma ujumbe wa malipo kwa oda *{orderId}*: *jina la mlipaji*, *kiasi*, na *muda*. Unaweza pia kutuma *screenshot*.",
    txn_message_ok: "Maelezo ya malipo yamepokelewa. Asante!",
    txn_image_ok: "Screenshot ya malipo imepokelewa. Asante!",

    // Tracking
    prompt_order_id: "Tafadhali andika *OrderID* (mfano: UJANI-2025-0001).",
    status_not_found: "Samahani, hatukupata oda hiyo.",
    status_card:
      "*Oda:* {orderId}\n*Kichwa:* {title}\n*Jumla:* {total}\n*Hali ya sasa:* {status}\n*Uliolipa:* {paid}\n*Baki:* {balance}",
    status_awaiting: "Inasubiri malipo",
    status_partial: "Malipo ya sehemu",
    status_paid: "Imelipwa kikamilifu",

    // Agent
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
    menu_body: "How can we help you today?\nPick an option below.",
    menu_button: "Open",
    section_products: "Products",
    section_help: "Help",
    section_settings: "Settings",
    track_order_title: "Track Order",
    track_order_desc: "Check the status of your order",
    talk_agent_title: "Talk to an Agent",
    talk_agent_desc: "Get quick help from our team",

    // Language (informational)
    change_lang_prompt: "Choose a language:",
    lang_sw: "Kiswahili",
    lang_en: "English",
    lang_changed_to: "Language changed to: {lang}",

    // Pro Max
    promax_pick_package: "Ujani Pro Max — choose package A, B or C.",
    section_promax: "Pro Max Packages",
    promax_note_bottom: "Total price {price}. Pick your package, then complete the order.",

    // Product actions
    product_actions_body_prefix: "You selected:",
    opt_section: "Options",
    row_buy: "Buy now",
    row_info: "More details",
    row_add: "Add to cart",
    row_view_cart: "View cart",
    row_back_menu: "Back to menu",

    // Cart
    cart_added: "✅ *{title}* added to your cart.",
    cart_empty: "🧺 Your cart is empty.",
    cart_title: "Your cart",
    cart_cleared: "🧺 Cart cleared.",
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
    btn_back_menu: "Back to menu",

    // Product details (EN bullets)
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
      "• Boosts libido and/or sperm quality for conception.",
      "• Helps you last longer — about ~45+ minutes and combine first and second rounds.",
      "• Usage: two teaspoons morning, two noon, two evening.",
      "• Also helpful for those recovering from masturbation effects."
    ].join("\n"),
    promax_detail_promax_a: "This package has three oral medicines priced at TSh 350,000.",

    // Address / contact
    ask_full_name: "Send the *full name (three parts)* of the receiver/customer.",
    ask_address_structured:
      "Enter your *address* as: *street(s), city, country* (e.g., Keko Furniture, Dar es Salaam, Tanzania).",
    address_invalid:
      "Please type your address in the form: *street(s), city, country* (e.g., Keko Furniture, Dar es Salaam, Tanzania).",
    ask_phone: "Enter a phone number we can reach you on now (e.g., +2557XXXXXXXX or 07XXXXXXXX).",
    phone_invalid: "That phone number doesn’t look valid. Please try again (e.g., +2557XXXXXXXX or 07XXXXXXXX).",

    // Area (info)
    choose_area: "Are you *within Dar es Salaam* or *outside Dar es Salaam*?",
    btn_area_dar: "Within Dar es Salaam",
    btn_area_outside: "Outside Dar es Salaam",

    // Order summaries
    order_created_title: "Order Summary",
    order_created_body_single:
      "Your order for *{title}* of *{total}* has been saved.\n*Order ID:* {orderId}\n*Address:* {city} {country}\n\nYou can *Edit address* or *Pay now* below.",
    order_created_body_total:
      "Your order totaling *{total}* has been saved.\n*Order ID:* {orderId}\n*Address:* {city} {country}\n\nYou can *Edit address* or *Pay now* below.",
    order_next_actions: "Choose your next step:",
    btn_pay_now: "Pay now",
    btn_edit_address: "Edit address",

    edit_address_prompt: "Enter a new address: *street(s), city, country*.",
    edit_address_ok: "Address updated.",

    // Pickup completion
    pickup_thanks: "Hello {customerName}, you’re welcome to our office located at Keko Furniture near Omax Bar.",

    // Transactions
    prompt_txn_message:
      "Send a payment message for order *{orderId}*: *payer name*, *amount*, and *time*. You can also send a *screenshot*.",
    txn_message_ok: "Payment details received. Thank you!",
    txn_image_ok: "Payment screenshot received. Thank you!",

    // Tracking
    prompt_order_id: "Please enter your *OrderID* (e.g., UJANI-2025-0001).",
    status_not_found: "Sorry, we couldn’t find that order.",
    status_card:
      "*Order:* {orderId}\n*Title:* {title}\n*Total:* {total}\n*Status:* {status}\n*Paid:* {paid}\n*Balance:* {balance}",
    status_awaiting: "Awaiting payment",
    status_partial: "Partially paid",
    status_paid: "Fully paid",

    // Agent
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

    // Generic
    not_found: "Sorry, not found.",
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
