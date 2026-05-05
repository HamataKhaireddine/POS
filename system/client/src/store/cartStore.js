import { create } from "zustand";

/**
 * حالة سلة POS — كميات وأسعار لكل فرع
 */
function pickUnitPrice(product, useWholesale) {
  const retail = Number(product.price);
  const w = product.wholesalePrice != null ? Number(product.wholesalePrice) : null;
  if (useWholesale && w != null && !Number.isNaN(w)) return w;
  return retail;
}

function pickCost(product) {
  if (product.cost == null || product.cost === "") return null;
  const c = Number(product.cost);
  return Number.isNaN(c) ? null : c;
}

export const useCartStore = create((set, get) => ({
  branchId: null,
  items: [],
  /** عند true تُستخدم أسعار الجملة في السلة (إن وُجدت) */
  useWholesalePricing: false,

  setBranchId: (branchId) => set({ branchId }),

  setUseWholesalePricing: (v) => set({ useWholesalePricing: Boolean(v) }),

  /** يحدّث أسطر السلة من أسعار الكتالوج الحالية (بعد جلب المنتجات أو تغيير وضع الجملة) */
  syncLinePricesFromProducts: (products) =>
    set((state) => {
      const map = new Map(products.map((p) => [p.id, p]));
      return {
        items: state.items.map((i) => {
          const p = map.get(i.productId);
          if (!p) return i;
          return {
            ...i,
            unitPrice: pickUnitPrice(p, state.useWholesalePricing),
            cost: pickCost(p),
          };
        }),
      };
    }),

  addProduct: (product, qty = 1) => {
    const inv = product.inventories?.[0];
    const stock = inv?.quantity ?? 0;
    const useW = get().useWholesalePricing;
    const unitPrice = pickUnitPrice(product, useW);
    const cost = pickCost(product);
    set((state) => {
      const existing = state.items.find((i) => i.productId === product.id);
      const nextQty = (existing?.quantity ?? 0) + qty;
      if (nextQty > stock) return state;
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.productId === product.id
              ? {
                  ...i,
                  quantity: nextQty,
                  name: product.name,
                  nameEn: product.nameEn || null,
                  unitPrice,
                  cost,
                }
              : i
          ),
        };
      }
      return {
        items: [
          ...state.items,
          {
            productId: product.id,
            name: product.name,
            nameEn: product.nameEn || null,
            imageUrl: product.imageUrl,
            petType: product.petType,
            unitPrice,
            cost,
            quantity: qty,
            maxStock: stock,
          },
        ],
      };
    });
  },

  setQuantity: (productId, quantity) => {
    const q = Math.max(1, Math.floor(quantity));
    set((state) => ({
      items: state.items.map((i) => {
        if (i.productId !== productId) return i;
        const max = i.maxStock ?? q;
        return { ...i, quantity: Math.min(q, max) };
      }),
    }));
  },

  removeLine: (productId) =>
    set((state) => ({
      items: state.items.filter((i) => i.productId !== productId),
    })),

  clear: () => set({ items: [] }),

  /** استرجاع سلة معلّقة — يجب أن تكون الأصناف بنفس شكل عناصر السلة */
  replaceAll: (items) =>
    set({
      items: Array.isArray(items)
        ? items.map((i) => ({
            productId: i.productId,
            name: i.name,
            nameEn: i.nameEn ?? null,
            imageUrl: i.imageUrl,
            petType: i.petType,
            unitPrice: Number(i.unitPrice),
            cost: i.cost != null ? Number(i.cost) : null,
            quantity: Math.max(1, Math.floor(Number(i.quantity) || 1)),
            maxStock: Math.max(0, Math.floor(Number(i.maxStock) || 0)),
          }))
        : [],
    }),

  total: () => {
    const items = get().items;
    return items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  },
}));
