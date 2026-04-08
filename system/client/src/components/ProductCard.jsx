import React, { useEffect, useState } from "react";
import { useI18n } from "../context/LanguageContext.jsx";
import { productDisplayName } from "../utils/productName.js";
import { resolveImageUrlForDisplay } from "../utils/imageUrl.js";
import { ProductImagePlaceholder } from "./ProductImagePlaceholder.jsx";

const PET_KEYS = { CAT: "pet.cat", DOG: "pet.dog", OTHER: "pet.other" };

/**
 * بطاقة منتج لشاشة POS — صورة، اسم، نوع الحيوان، سعر، زر إضافة
 */
export function ProductCard({ product, onAdd, disabled }) {
  const { t, locale } = useI18n();
  const [imgErr, setImgErr] = useState(false);
  const inv = product.inventories?.[0];
  const stock = inv?.quantity ?? 0;
  const out = stock <= 0;
  const rawUrl = product.imageUrl ?? product.image_url;
  const imgUrl = resolveImageUrlForDisplay(rawUrl);

  useEffect(() => {
    setImgErr(false);
  }, [product.id, rawUrl]);

  const canAdd = !disabled && !out;

  const addOne = () => {
    if (!canAdd) return;
    onAdd(product);
  };

  return (
    <div
      className={`card product-card-pos${canAdd ? " product-card-pos--clickable" : ""}`}
      role={canAdd ? "button" : undefined}
      tabIndex={canAdd ? 0 : undefined}
      onClick={canAdd ? addOne : undefined}
      onKeyDown={
        canAdd
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                addOne();
              }
            }
          : undefined
      }
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 220,
        cursor: canAdd ? "pointer" : "default",
      }}
    >
      <div
        style={{
          aspectRatio: "4/3",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--surface2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {imgUrl && !imgErr ? (
          <img
            src={imgUrl}
            alt=""
            decoding="async"
            onError={() => setImgErr(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            loading="lazy"
          />
        ) : (
          <ProductImagePlaceholder />
        )}
      </div>
      <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.3 }}>{productDisplayName(product, locale)}</div>
      {product.brand?.name ? (
        <div style={{ fontSize: 11, color: "var(--muted)" }}>{product.brand.name}</div>
      ) : null}
      <div style={{ fontSize: 12, color: "var(--accent2)" }}>
        {t(PET_KEYS[product.petType] || "pet.other")}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
        <span style={{ fontWeight: 800, fontSize: 18 }}>
          {Number(product.price).toFixed(2)} {t("common.currency")}
        </span>
        <span style={{ fontSize: 11, color: out ? "var(--danger)" : "var(--muted)" }}>
          {t("productCard.stock")} {stock}
        </span>
      </div>
      <button
        type="button"
        className="btn-touch"
        disabled={disabled || out}
        onClick={(e) => {
          e.stopPropagation();
          onAdd(product);
        }}
        style={{
          background: out
            ? "var(--surface2)"
            : "linear-gradient(135deg, var(--accent), var(--accent-deep))",
          color: "#fff",
          opacity: out ? 0.5 : 1,
        }}
      >
        {out ? t("productCard.out") : t("productCard.add")}
      </button>
    </div>
  );
}
