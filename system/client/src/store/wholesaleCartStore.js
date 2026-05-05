import { create } from "zustand";

function pickWholesaleUnitPrice(product) {
  const retail = Number(product.price);
  const w = product.wholesalePrice != null ? Number(product.wholesalePrice) : null;
  if (w != null && !Number.isNaN(w)) return w;
  return retail;
}

function pickCost(product) {
  if (product.cost == null || product.cost === "") return null;
  const c = Number(product.cost);
  return Number.isNaN(c) ? null : c;
}

/** سلة مخصّصة لقسم الجملة — دائماً أسعار الجملة (أو التجزئة إن لم يُضبط سعر جملة) */
export const useWholesaleCartStore = create((set, get) => ({
  branchId: null,
  items: [],

  setBranchId: (branchId) => set({ branchId }),

  syncLinePricesFromProducts: (products) =>
    set((state) => {
      const map = new Map(products.map((p) => [p.id, p]));
      return {
        items: state.items.map((i) => {
          const p = map.get(i.productId);
          if (!p) return i;
          return { ...i, unitPrice: pickWholesaleUnitPrice(p), cost: pickCost(p) };
        }),
      };
    }),

  addProduct: (product, qty = 1) => {
    const inv = product.inventories?.[0];
    const stock = inv?.quantity ?? 0;
    const unitPrice = pickWholesaleUnitPrice(product);
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
