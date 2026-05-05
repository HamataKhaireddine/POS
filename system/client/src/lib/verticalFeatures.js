/**
 * إظهار أو إخفاء وحدات الواجهة حسب مجال النشاط (Organization.businessVertical).
 * إذا لم يُضبط المجال (منشآت قديمة) نعرض كل الشاشات — سلوك متوافق مع الخلف.
 */

/** أنشطة لا تحتاج قناة جملة في الواجهة */
const WHOLESALE_EXCLUDED = new Set([
  "BOOKING_SERVICES",
  "BEAUTY_SALON",
  "HOTEL",
  "FITNESS",
]);

/** أنشطة يُفترض فيها مواعيد / حجوزات أو صيانة جدولة */
const APPOINTMENTS_VERTICALS = new Set([
  "BOOKING_SERVICES",
  "BEAUTY_SALON",
  "PET_STORE",
  "HOTEL",
  "FITNESS",
  "PHARMACY",
  "RESTAURANT",
  "CAFE",
  "SERVICES_OTHER",
  "CLOTHING",
  "PHONE_STORE",
  "AUTO_DEALER",
]);

/** أنشطة لا نعرض فيها مسارات التوصيل الافتراضية */
const DELIVERY_EXCLUDED = new Set(["BOOKING_SERVICES", "AUTO_DEALER"]);

/** أنشطة نقطة بيع مباشرة — غالباً دون ذمم عملاء */
const CUSTOMER_ACCOUNTS_EXCLUDED = new Set([
  "CAFE",
  "RESTAURANT",
  "BOOKING_SERVICES",
  "BEAUTY_SALON",
  "HOTEL",
  "FITNESS",
]);

/**
 * @param {'wholesale' | 'appointments' | 'delivery' | 'customerAccounts' | 'petPosFilters'} feature
 * @param {string | null | undefined} businessVertical
 */
export function isVerticalFeatureEnabled(feature, businessVertical) {
  if (businessVertical == null || String(businessVertical).trim() === "") {
    return true;
  }
  const v = String(businessVertical).trim();
  switch (feature) {
    case "petPosFilters":
      return v === "PET_STORE";
    case "wholesale":
      return !WHOLESALE_EXCLUDED.has(v);
    case "appointments":
      return APPOINTMENTS_VERTICALS.has(v);
    case "delivery":
      return !DELIVERY_EXCLUDED.has(v);
    case "customerAccounts":
      return !CUSTOMER_ACCOUNTS_EXCLUDED.has(v);
    default:
      return true;
  }
}
