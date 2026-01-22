"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { api, get } from "@/lib/api";
import { toast } from "sonner";

type FlowResp = {
  key: string;
  value: any;
  is_default: boolean;
};

type ActionId =
  | "ACTION_VIEW_CART"
  | "ACTION_CHECKOUT"
  | "ACTION_TRACK_BY_NAME"
  | "ACTION_TALK_TO_AGENT"
  | "ACTION_CHANGE_LANGUAGE"
  | "ACTION_FAQ"
  | "ACTION_BACK";

type ProductRowToken =
  | "VARIANTS_{sku}"
  | "BUY_{sku}"
  | "ADD_{sku}"
  | "DETAILS_{sku}"
  | "ACTION_VIEW_CART"
  | "ACTION_CHECKOUT"
  | "ACTION_BACK";

type FlowConfigV1 = {
  version: 1;
  mainMenu: {
    groupByCategory: boolean;
    maxRowsPerSection: number; // 1..9
    actions: ActionId[];
    showSettingsSection: boolean;
    settings: ActionId[];
  };
  productMenu: {
    rows: ProductRowToken[];
  };
};

type Product = {
  id: number;
  sku: string;
  name: string;
  price_tzs: number;
  category?: string | null;
  in_catalogue?: boolean;
  is_active?: boolean;
};

const ACTIONS: Array<{
  id: ActionId;
  label: string;
  help: string;
  group: "main" | "settings" | "both";
}> = [
  { id: "ACTION_VIEW_CART", label: "View cart", help: "Shows the customer their cart items.", group: "main" },
  { id: "ACTION_CHECKOUT", label: "Checkout", help: "Starts checkout and delivery/payment flow.", group: "main" },
  { id: "ACTION_TRACK_BY_NAME", label: "Track order", help: "Customer can check order status.", group: "main" },
  { id: "ACTION_TALK_TO_AGENT", label: "Talk to agent", help: "Hands over the chat to staff.", group: "main" },
  { id: "ACTION_FAQ", label: "FAQ", help: "Shows help/FAQs.", group: "settings" },
  { id: "ACTION_CHANGE_LANGUAGE", label: "Change language", help: "Lets customer switch language.", group: "settings" },
  { id: "ACTION_BACK", label: "Back", help: "Returns to main menu (used in some flows).", group: "both" },
];

const PRODUCT_ROWS: Array<{
  id: ProductRowToken;
  label: string;
  help: string;
}> = [
  { id: "VARIANTS_{sku}", label: "Choose variant (only if product has variants)", help: "Shows variant options for this product." },
  { id: "BUY_{sku}", label: "Buy now", help: "Immediate purchase flow for this product." },
  { id: "ADD_{sku}", label: "Add to cart", help: "Adds this product to cart." },
  { id: "DETAILS_{sku}", label: "More details", help: "Shows product details/description." },
  { id: "ACTION_VIEW_CART", label: "View cart", help: "Show cart items." },
  { id: "ACTION_CHECKOUT", label: "Checkout", help: "Proceed to checkout." },
  { id: "ACTION_BACK", label: "Back to menu", help: "Return to main menu." },
];

function clampInt(n: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}
function move<T>(arr: T[], from: number, to: number) {
  const a = [...arr];
  const [item] = a.splice(from, 1);
  a.splice(to, 0, item);
  return a;
}
function formatTZS(amount: number) {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  return `${Math.round(safe).toLocaleString("sw-TZ")} TZS`;
}

function actionLabel(id: ActionId) {
  const a = ACTIONS.find((x) => x.id === id);
  return a ? a.label : id;
}

function buildMainMenuPreview(cfg: FlowConfigV1, products: Product[]) {
  const maxRows = clampInt(Number(cfg.mainMenu.maxRowsPerSection), 1, 9, 9);
  const group = !!cfg.mainMenu.groupByCategory;

  const catOf = (p: Product) => (p.category || "General").trim() || "General";

  const productSections: Array<{ title: string; rows: Array<{ id: string; title: string }> }> = [];

  if (!group) {
    const rows = products.slice(0, maxRows).map((p) => ({
      id: `PRODUCT_${p.sku}`,
      title: `${p.name} — ${formatTZS(p.price_tzs)}`,
    }));
    productSections.push({ title: "Products", rows });
  } else {
    const byCat = new Map<string, Product[]>();
    for (const p of products) {
      const c = catOf(p);
      const arr = byCat.get(c) ?? [];
      arr.push(p);
      byCat.set(c, arr);
    }
    const cats = Array.from(byCat.keys()).sort((a, b) => a.localeCompare(b));
    for (const c of cats.slice(0, 9)) {
      const rows = (byCat.get(c) ?? [])
        .slice(0, maxRows)
        .map((p) => ({ id: `PRODUCT_${p.sku}`, title: `${p.name} — ${formatTZS(p.price_tzs)}` }));
      if (rows.length) productSections.push({ title: c, rows });
    }
  }

  const actions = (cfg.mainMenu.actions || []).map((id) => ({
    id,
    title: actionLabel(id),
  }));

  const settings = (cfg.mainMenu.settings || []).map((id) => ({
    id,
    title: actionLabel(id),
  }));

  const sections: Array<{ title: string; rows: Array<{ id: string; title: string }> }> = [];
  sections.push(...productSections);

  if (actions.length) sections.push({ title: "Actions", rows: actions });

  if (cfg.mainMenu.showSettingsSection && settings.length) {
    sections.push({ title: "Settings", rows: settings });
  }

  return sections;
}

function buildProductMenuPreview(cfg: FlowConfigV1, product: Product | null, hasVariants: boolean) {
  if (!product) return { mode: "none" as const, prompt: "", rows: [] as Array<{ id: string; title: string }> };

  const sku = product.sku;
  const rows: Array<{ id: string; title: string }> = [];

  for (const raw of cfg.productMenu?.rows ?? []) {
    const token = String(raw);

    if (token === "VARIANTS_{sku}" || token === "VARIANTS") {
      if (hasVariants) {
        rows.push({ id: `VARIANTS_${sku}`, title: "Choose variant" });
      }
      continue;
    }

    const idStr = token.includes("{sku}") ? token.replaceAll("{sku}", sku) : token;

    let title = idStr;
    if (idStr.startsWith("BUY_")) title = "Buy now";
    else if (idStr.startsWith("ADD_")) title = "Add to cart";
    else if (idStr.startsWith("DETAILS_")) title = "More details";
    else if (idStr === "ACTION_VIEW_CART") title = "View cart";
    else if (idStr === "ACTION_CHECKOUT") title = "Checkout";
    else if (idStr === "ACTION_BACK") title = "Back to menu";

    rows.push({ id: idStr, title });
  }

  const prompt = `Choose what you want to do with ${product.name}`;

  // WhatsApp buttons max = 3. If more, it becomes a list.
  const mode = rows.length <= 3 ? "buttons" : "list";
  return { mode, prompt, rows };
}

export default function FlowPage() {
  const { user } = useAuth();
  const canEdit = useMemo(() => user?.role === "admin", [user]);

  const [loading, setLoading] = useState(true);
  const [isDefault, setIsDefault] = useState(false);

  // Builder state
  const [groupByCategory, setGroupByCategory] = useState(true);
  const [maxRowsPerSection, setMaxRowsPerSection] = useState(9);
  const [showSettingsSection, setShowSettingsSection] = useState(true);

  const [mainActions, setMainActions] = useState<ActionId[]>([
    "ACTION_VIEW_CART",
    "ACTION_CHECKOUT",
    "ACTION_TRACK_BY_NAME",
    "ACTION_TALK_TO_AGENT",
  ]);

  const [settingsActions, setSettingsActions] = useState<ActionId[]>([
    "ACTION_FAQ",
    "ACTION_CHANGE_LANGUAGE",
  ]);

  const [productMenuRows, setProductMenuRows] = useState<ProductRowToken[]>([
    "VARIANTS_{sku}",
    "BUY_{sku}",
    "ADD_{sku}",
    "DETAILS_{sku}",
    "ACTION_VIEW_CART",
    "ACTION_CHECKOUT",
    "ACTION_BACK",
  ]);

  const [addRowValue, setAddRowValue] = useState<ProductRowToken>("ADD_{sku}");

  // Preview data
  const [previewTab, setPreviewTab] = useState<"main" | "product">("main");
  const [products, setProducts] = useState<Product[]>([]);
  const [previewSku, setPreviewSku] = useState<string>("");

  // Optional: a toggle for “this product has variants” (preview only)
  const [previewHasVariants, setPreviewHasVariants] = useState<boolean>(false);

  const cfg: FlowConfigV1 = useMemo(
    () => ({
      version: 1,
      mainMenu: {
        groupByCategory,
        maxRowsPerSection: clampInt(Number(maxRowsPerSection), 1, 9, 9),
        actions: mainActions,
        showSettingsSection,
        settings: settingsActions,
      },
      productMenu: { rows: productMenuRows },
    }),
    [groupByCategory, maxRowsPerSection, mainActions, showSettingsSection, settingsActions, productMenuRows]
  );

  async function loadFlow() {
    setLoading(true);
    try {
      const data = await get<FlowResp>("/api/bot-config/flow");
      setIsDefault(!!data.is_default);

      const v: FlowConfigV1 = data.value;

      setGroupByCategory(!!v?.mainMenu?.groupByCategory);
      setMaxRowsPerSection(clampInt(Number(v?.mainMenu?.maxRowsPerSection), 1, 9, 9));
      setShowSettingsSection(!!v?.mainMenu?.showSettingsSection);

      setMainActions(uniq((v?.mainMenu?.actions ?? []).filter(Boolean)) as ActionId[]);
      setSettingsActions(uniq((v?.mainMenu?.settings ?? []).filter(Boolean)) as ActionId[]);
      setProductMenuRows(uniq((v?.productMenu?.rows ?? []).filter(Boolean)) as ProductRowToken[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load flow config");
    } finally {
      setLoading(false);
    }
  }

  async function loadProductsForPreview() {
    try {
      const list = await get<Product[]>("/api/products");
      const usable = (list || []).filter((p) => p.is_active !== false && p.in_catalogue !== false);
      setProducts(usable);

      if (!previewSku && usable.length) {
        setPreviewSku(usable[0].sku);
      }
    } catch (e: any) {
      // Preview should not block the page if it fails.
      console.error("Failed to load products for preview", e);
    }
  }

  useEffect(() => {
    loadFlow();
    loadProductsForPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!canEdit) {
      toast.error("Only admin can edit flow.");
      return;
    }

    try {
      await api<{ ok: true }>("/api/bot-config/flow", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: cfg }),
      });
      toast.success("Flow saved.");
      await loadFlow();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save flow");
    }
  }

  async function reset() {
    if (!canEdit) {
      toast.error("Only admin can reset flow.");
      return;
    }
    try {
      await api<void>("/api/bot-config/flow", { method: "DELETE" });
      toast.success("Flow reset to default.");
      await loadFlow();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to reset flow");
    }
  }

  function toggleMainAction(id: ActionId) {
    setMainActions((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleSettingsAction(id: ActionId) {
    setSettingsActions((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function addProductRow() {
    setProductMenuRows((prev) => (prev.includes(addRowValue) ? prev : [...prev, addRowValue]));
  }
  function removeProductRow(i: number) {
    setProductMenuRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  function moveProductRowUp(i: number) {
    if (i <= 0) return;
    setProductMenuRows((prev) => move(prev, i, i - 1));
  }
  function moveProductRowDown(i: number) {
    setProductMenuRows((prev) => (i >= prev.length - 1 ? prev : move(prev, i, i + 1)));
  }

  const previewSections = useMemo(() => buildMainMenuPreview(cfg, products), [cfg, products]);
  const previewProduct = useMemo(() => products.find((p) => p.sku === previewSku) ?? null, [products, previewSku]);
  const productPreview = useMemo(
    () => buildProductMenuPreview(cfg, previewProduct, previewHasVariants),
    [cfg, previewProduct, previewHasVariants]
  );

  if (!user) return null;

  return (
    <div className="page-root">
      <div className="flow-layout">
        {/* LEFT: BUILDER */}
        <div className="page-card">
          <div className="page-title">Flow Builder</div>
          <div className="page-subtitle">Design what customers see in WhatsApp menus. No coding required.</div>

          {!canEdit && (
            <div className="flow-warning">
              You are logged in as <b>staff</b>. You can view this flow, but only <b>admin</b> can edit.
            </div>
          )}

          <div className="flow-meta">
            <div>
              <span className={"flow-pill " + (isDefault ? "flow-pill--neutral" : "flow-pill--active")}>
                {isDefault ? "Default" : "Customized"}
              </span>
            </div>

            <div className="flow-actions">
              <button className="btn btn-xs" onClick={loadFlow} disabled={loading}>
                Reload
              </button>
              <button className="btn btn-xs btn-primary" onClick={save} disabled={loading || !canEdit}>
                Save
              </button>
              <button className="btn btn-xs btn-danger" onClick={reset} disabled={loading || !canEdit}>
                Reset to default
              </button>
            </div>
          </div>

          {/* MAIN MENU */}
          <div className="flow-section">
            <div className="flow-section-header">
              <div>
                <div className="flow-section-title">Main Menu</div>
                <div className="flow-section-subtitle">Controls how the product list and main actions appear.</div>
              </div>
            </div>

            <div className="flow-grid">
              <label className="flow-flag">
                <input
                  type="checkbox"
                  checked={groupByCategory}
                  onChange={(e) => setGroupByCategory(e.target.checked)}
                  disabled={!canEdit}
                />
                <span>Group products by category</span>
              </label>

              <div className="flow-field">
                <div className="flow-label">Max items per section (1–9)</div>
                <input
                  type="number"
                  className="flow-input"
                  value={maxRowsPerSection}
                  min={1}
                  max={9}
                  onChange={(e) => setMaxRowsPerSection(Number(e.target.value))}
                  disabled={!canEdit}
                />
                <div className="flow-help">WhatsApp list sections work best with few items. Keep it 6–9.</div>
              </div>

              <label className="flow-flag">
                <input
                  type="checkbox"
                  checked={showSettingsSection}
                  onChange={(e) => setShowSettingsSection(e.target.checked)}
                  disabled={!canEdit}
                />
                <span>Show Settings section</span>
              </label>
            </div>

            <div className="flow-columns">
              <div className="flow-col">
                <div className="flow-col-title">Main actions</div>
                <div className="flow-option-list">
                  {ACTIONS.filter((a) => a.group === "main" || a.group === "both").map((a) => (
                    <label key={a.id} className="flow-option">
                      <input
                        type="checkbox"
                        checked={mainActions.includes(a.id)}
                        onChange={() => toggleMainAction(a.id)}
                        disabled={!canEdit}
                      />
                      <div className="flow-option-text">
                        <div className="flow-option-title">{a.label}</div>
                        <div className="flow-option-help">{a.help}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flow-col">
                <div className="flow-col-title">Settings actions</div>
                <div className="flow-option-list">
                  {ACTIONS.filter((a) => a.group === "settings" || a.group === "both").map((a) => (
                    <label key={a.id} className="flow-option">
                      <input
                        type="checkbox"
                        checked={settingsActions.includes(a.id)}
                        onChange={() => toggleSettingsAction(a.id)}
                        disabled={!canEdit || !showSettingsSection}
                      />
                      <div className="flow-option-text">
                        <div className="flow-option-title">{a.label}</div>
                        <div className="flow-option-help">{a.help}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {!showSettingsSection && <div className="flow-note">Settings section is disabled, so these won’t appear.</div>}
              </div>
            </div>
          </div>

          {/* PRODUCT MENU */}
          <div className="flow-section">
            <div className="flow-section-header">
              <div>
                <div className="flow-section-title">Product Menu</div>
                <div className="flow-section-subtitle">Controls what a customer sees after selecting a product.</div>
              </div>
            </div>

            <div className="flow-row">
              <div className="flow-field flow-field--wide">
                <div className="flow-label">Add an option</div>
                <div className="flow-inline">
                  <select
                    className="flow-select"
                    value={addRowValue}
                    onChange={(e) => setAddRowValue(e.target.value as ProductRowToken)}
                    disabled={!canEdit}
                  >
                    {PRODUCT_ROWS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>

                  <button className="btn btn-xs btn-primary" onClick={addProductRow} disabled={!canEdit}>
                    Add
                  </button>
                </div>
                <div className="flow-help">
                  If you add more than 3 options, WhatsApp buttons cannot fit — the bot will use a list automatically.
                </div>
              </div>
            </div>

            <div className="flow-list">
              {productMenuRows.map((token, i) => {
                const meta = PRODUCT_ROWS.find((r) => r.id === token);
                return (
                  <div key={`${token}-${i}`} className="flow-list-item">
                    <div className="flow-list-main">
                      <div className="flow-list-title">{meta?.label ?? token}</div>
                      <div className="flow-list-help">{meta?.help ?? ""}</div>
                    </div>

                    <div className="flow-list-actions">
                      <button className="btn btn-xs" onClick={() => moveProductRowUp(i)} disabled={!canEdit || i === 0} title="Move up">
                        ↑
                      </button>
                      <button
                        className="btn btn-xs"
                        onClick={() => moveProductRowDown(i)}
                        disabled={!canEdit || i === productMenuRows.length - 1}
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button className="btn btn-xs btn-danger" onClick={() => removeProductRow(i)} disabled={!canEdit} title="Remove">
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flow-note">
              Recommended: <b>Add to cart</b>, <b>Buy now</b>, <b>More details</b>, then <b>Checkout</b>.
            </div>
          </div>
        </div>

        {/* RIGHT: PREVIEW */}
        <div className="page-card flow-preview">
          <div className="flow-preview-header">
            <div>
              <div className="page-title">WhatsApp Preview</div>
              <div className="page-subtitle">This is how customers will see the menus.</div>
            </div>

            <div className="flow-preview-tabs">
              <button
                className={"flow-tab " + (previewTab === "main" ? "flow-tab--active" : "")}
                onClick={() => setPreviewTab("main")}
                type="button"
              >
                Main menu
              </button>
              <button
                className={"flow-tab " + (previewTab === "product" ? "flow-tab--active" : "")}
                onClick={() => setPreviewTab("product")}
                type="button"
              >
                Product menu
              </button>
            </div>
          </div>

          {previewTab === "main" ? (
            <div className="wa-preview">
              <div className="wa-bubble wa-bubble--bot">
                <div className="wa-title">Choose from the menu</div>
                {previewSections.length === 0 ? (
                  <div className="wa-muted">No sections (check your settings).</div>
                ) : (
                  previewSections.map((sec) => (
                    <div key={sec.title} className="wa-section">
                      <div className="wa-section-title">{sec.title}</div>
                      {sec.rows.length ? (
                        <div className="wa-rows">
                          {sec.rows.map((r) => (
                            <div key={r.id} className="wa-row">
                              {r.title}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="wa-muted">No items.</div>
                      )}
                    </div>
                  ))
                )}
                <div className="wa-foot">WhatsApp List Message</div>
              </div>
            </div>
          ) : (
            <div className="wa-preview">
              <div className="flow-preview-controls">
                <div className="flow-field flow-field--wide">
                  <div className="flow-label">Preview product</div>
                  <select className="flow-select" value={previewSku} onChange={(e) => setPreviewSku(e.target.value)}>
                    {products.map((p) => (
                      <option key={p.sku} value={p.sku}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </select>
                  <div className="flow-help">This preview uses your catalogue products (active + in catalogue).</div>
                </div>

                <label className="flow-flag">
                  <input
                    type="checkbox"
                    checked={previewHasVariants}
                    onChange={(e) => setPreviewHasVariants(e.target.checked)}
                  />
                  <span>Assume this product has variants (preview only)</span>
                </label>
              </div>

              <div className="wa-bubble wa-bubble--bot">
                <div className="wa-title">{productPreview.prompt || "Select a product to preview."}</div>

                {productPreview.mode === "buttons" ? (
                  <>
                    <div className="wa-muted">Mode: WhatsApp Buttons (max 3)</div>
                    <div className="wa-buttons">
                      {productPreview.rows.map((r) => (
                        <div key={r.id} className="wa-button">
                          {r.title}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="wa-muted">Mode: WhatsApp List (because options &gt; 3)</div>
                    <div className="wa-section">
                      <div className="wa-section-title">Options</div>
                      <div className="wa-rows">
                        {productPreview.rows.map((r) => (
                          <div key={r.id} className="wa-row">
                            {r.title}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div className="wa-foot">Preview only</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
