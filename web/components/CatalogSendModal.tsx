import { useEffect, useMemo, useState } from "react";
import { api, type ApiError } from "@/lib/api";

type CatalogDiagnostics = {
  catalog_enabled: boolean;
  connected_catalog_id: string | null;
  inbox_send_usable?: boolean;
  product_link_summary?: {
    totalProducts: number;
    linkedProducts: number;
    byStatus: Record<string, number>;
  };
  issues: Array<{ level: "error" | "warn"; code: string; message: string }>;
};

type ProductOption = {
  id: number;
  sku: string;
  name: string;
  image_url?: string | null;
  price_tzs: number;
  is_active: boolean;
  stock_qty: number | null;
  catalog_link_status?: string | null;
  catalog_meta_retailer_id?: string | null;
  catalog_meta_catalog_id?: string | null;
  catalog_link_error?: string | null;
};

type Mode = "catalog" | "single" | "multi";

type Props = {
  conversationId: string | number;
  open: boolean;
  onClose: () => void;
  onSent?: () => void | Promise<void>;
};

const MAX_MULTI_SELECT = 10;

function formatPrice(value: number) {
  return Math.floor(Number(value ?? 0)).toLocaleString("sw-TZ");
}

function describeLinkStatus(product: ProductOption) {
  const status = String(product.catalog_link_status ?? "").trim();
  if (status === "synced") return "Catalog linked";
  if (status === "imported") return "Imported from catalog";
  if (status === "failed") return "Catalog sync failed";
  return product.catalog_meta_retailer_id ? "Catalog ready" : "Uses SKU mapping";
}

export default function CatalogSendModal({ conversationId, open, onClose, onSent }: Props) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("catalog");
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [diagnostics, setDiagnostics] = useState<CatalogDiagnostics | null>(null);
  const [query, setQuery] = useState("");
  const [singleId, setSingleId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    void Promise.all([
      api<{ items: ProductOption[] }>("/api/products"),
      api<{ ok: true; diagnostics: CatalogDiagnostics }>("/api/setup/catalog-diagnostics"),
    ])
      .then(([productResponse, diagnosticsResponse]) => {
        if (cancelled) return;
        const items = (productResponse?.items ?? []).filter((product) => product.is_active !== false);
        setProducts(items);
        setDiagnostics(diagnosticsResponse?.diagnostics ?? null);
        setSingleId(items[0]?.id ?? null);
        setSelectedIds([]);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load catalog send options", err);
        setError("Unable to load catalog sharing options right now.");
        setProducts([]);
        setDiagnostics(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const filteredProducts = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return products;
    return products.filter((product) =>
      [product.name, product.sku, product.catalog_meta_retailer_id ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(trimmed)
    );
  }, [products, query]);

  const selectedProducts = useMemo(
    () => products.filter((product) => selectedIds.includes(product.id)),
    [products, selectedIds]
  );

  const selectedSingle = useMemo(
    () => products.find((product) => product.id === singleId) ?? null,
    [products, singleId]
  );

  const catalogReady =
    diagnostics?.catalog_enabled !== false &&
    !!diagnostics?.connected_catalog_id &&
    diagnostics?.inbox_send_usable !== false;

  if (!open) return null;

  async function handleSubmit() {
    setSending(true);
    setError(null);

    try {
      if (mode === "catalog") {
        await api("/api/send-catalog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId }),
        });
      } else if (mode === "single") {
        if (!singleId) {
          setError("Choose a product first.");
          setSending(false);
          return;
        }
        await api("/api/send-product", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, productId: singleId }),
        });
      } else {
        if (selectedIds.length === 0) {
          setError("Select at least one product first.");
          setSending(false);
          return;
        }
        await api("/api/send-multi-product", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, productIds: selectedIds }),
        });
      }

      await onSent?.();
      onClose();
    } catch (err) {
      console.error("Failed to send catalog content", err);
      const apiErr = err as ApiError;
      setError(apiErr.message ?? "Unable to send catalog content right now.");
    } finally {
      setSending(false);
    }
  }

  function toggleMultiSelect(productId: number) {
    setSelectedIds((current) => {
      if (current.includes(productId)) {
        return current.filter((id) => id !== productId);
      }
      if (current.length >= MAX_MULTI_SELECT) {
        return current;
      }
      return [...current, productId];
    });
  }

  return (
    <div className="template-modal-overlay" onClick={onClose}>
      <div className="template-modal catalog-send-modal" onClick={(event) => event.stopPropagation()}>
        <div className="template-modal-header">
          <div>
            <div className="template-modal-title">Share catalog</div>
            <div className="template-modal-copy">
              Send the full catalog, a single product, or a short product list into this thread.
            </div>
          </div>
          <button type="button" className="thread-header-action" onClick={onClose}>
            Close
          </button>
        </div>

        {loading ? (
          <div className="template-modal-state">Loading catalog options...</div>
        ) : !catalogReady ? (
          <div className="template-modal-state template-modal-state--empty">
            <div>Catalog sharing is not ready yet for this workspace.</div>
            {diagnostics?.issues?.[0]?.message ? (
              <div className="catalog-send-helper">{diagnostics.issues[0].message}</div>
            ) : null}
          </div>
        ) : (
          <div className="template-modal-body catalog-send-modal-body">
            <div className="catalog-send-modes">
              <button
                type="button"
                className={"template-option" + (mode === "catalog" ? " template-option--active" : "")}
                onClick={() => setMode("catalog")}
              >
                <div className="template-option-title">Full catalog</div>
                <div className="template-option-meta">Share the storefront entry point</div>
              </button>
              <button
                type="button"
                className={"template-option" + (mode === "single" ? " template-option--active" : "")}
                onClick={() => setMode("single")}
              >
                <div className="template-option-title">One product</div>
                <div className="template-option-meta">Choose a single catalog product</div>
              </button>
              <button
                type="button"
                className={"template-option" + (mode === "multi" ? " template-option--active" : "")}
                onClick={() => setMode("multi")}
              >
                <div className="template-option-title">Multiple products</div>
                <div className="template-option-meta">Select up to {MAX_MULTI_SELECT}</div>
              </button>

              {diagnostics?.product_link_summary ? (
                <div className="catalog-send-summary">
                  <div className="template-form-label">Catalog readiness</div>
                  <div className="catalog-send-helper">
                    {diagnostics.product_link_summary.linkedProducts} linked of{" "}
                    {diagnostics.product_link_summary.totalProducts} local products
                  </div>
                </div>
              ) : null}
            </div>

            <div className="template-form">
              {mode === "catalog" ? (
                <div className="template-form-preview">
                  <div className="template-form-label">Full catalog</div>
                  <div className="template-form-preview-copy">
                    Sends the connected WhatsApp catalog entry point for this business number.
                  </div>
                </div>
              ) : (
                <>
                  <label className="template-field">
                    <span className="template-field-label">Search products</span>
                    <input
                      className="thread-input template-field-input"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search by product name or SKU"
                    />
                  </label>

                  <div className="catalog-product-list">
                    {filteredProducts.map((product) => {
                      const active =
                        mode === "single"
                          ? singleId === product.id
                          : selectedIds.includes(product.id);

                      return (
                        <button
                          key={product.id}
                          type="button"
                          className={
                            "catalog-product-card" +
                            (active ? " catalog-product-card--active" : "")
                          }
                          onClick={() => {
                            if (mode === "single") {
                              setSingleId(product.id);
                            } else {
                              toggleMultiSelect(product.id);
                            }
                          }}
                        >
                          <div className="catalog-product-card-main">
                            <div className="catalog-product-card-title">{product.name}</div>
                            <div className="catalog-product-card-meta">
                              SKU {product.sku} · TZS {formatPrice(product.price_tzs)}
                            </div>
                            <div className="catalog-product-card-subtle">
                              {describeLinkStatus(product)}
                              {product.catalog_link_error ? ` · ${product.catalog_link_error}` : ""}
                            </div>
                          </div>
                          <div className="catalog-product-card-check">
                            {mode === "single"
                              ? active
                                ? "Selected"
                                : "Choose"
                              : active
                                ? "Added"
                                : "Add"}
                          </div>
                        </button>
                      );
                    })}
                    {filteredProducts.length === 0 ? (
                      <div className="template-modal-state template-modal-state--empty">
                        No matching products found.
                      </div>
                    ) : null}
                  </div>

                  {mode === "single" && selectedSingle ? (
                    <div className="catalog-send-helper">
                      Sending: {selectedSingle.name}
                    </div>
                  ) : null}
                  {mode === "multi" ? (
                    <div className="catalog-send-helper">
                      {selectedProducts.length} selected
                      {selectedProducts.length >= MAX_MULTI_SELECT
                        ? ` · limit reached (${MAX_MULTI_SELECT})`
                        : ""}
                    </div>
                  ) : null}
                </>
              )}

              {error ? <div className="template-modal-error">{error}</div> : null}

              <div className="template-modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
                  disabled={sending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={handleSubmit}
                  disabled={
                    sending ||
                    !catalogReady ||
                    (mode === "single" && !singleId) ||
                    (mode === "multi" && selectedIds.length === 0)
                  }
                >
                  {sending
                    ? "Sending..."
                    : mode === "catalog"
                      ? "Share catalog"
                      : mode === "single"
                        ? "Share product"
                        : "Share products"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
