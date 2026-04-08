import { create } from "zustand";

/**
 * حالة سلة POS — كميات وأسعار لكل فرع
 */
export const useCartStore = create((set, get) => ({
  branchId: null,
  items: [],

  setBranchId: (branchId) => set({ branchId }),

  addProduct: (product, qty = 1) => {
    const inv = product.inventories?.[0];
    const stock = inv?.quantity ?? 0;
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
            unitPrice: Number(product.price),
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
