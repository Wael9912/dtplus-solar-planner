// Display currencies with indicative local-per-USD rates (late-2025 levels). These only pre-fill the exchange-rate field when the
// currency is changed — the UI tells the user to confirm today's rate. Pegged currencies (SAR, AED, QAR, OMR, BHD, JOD) are exact.
export interface CurrencyInfo { code: string; symbol: string; nameEn: string; nameAr: string; perUsd: number; decimals?: number }

export const currencies: CurrencyInfo[] = [
  { code: 'USD', symbol: '$', nameEn: 'US dollar', nameAr: 'دولار أمريكي', perUsd: 1 },
  { code: 'SDG', symbol: 'ج.س', nameEn: 'Sudanese pound', nameAr: 'جنيه سوداني', perUsd: 2500 },
  { code: 'SAR', symbol: 'ر.س', nameEn: 'Saudi riyal', nameAr: 'ريال سعودي', perUsd: 3.75 },
  { code: 'AED', symbol: 'د.إ', nameEn: 'UAE dirham', nameAr: 'درهم إماراتي', perUsd: 3.6725 },
  { code: 'EGP', symbol: 'ج.م', nameEn: 'Egyptian pound', nameAr: 'جنيه مصري', perUsd: 48.5 },
  { code: 'QAR', symbol: 'ر.ق', nameEn: 'Qatari riyal', nameAr: 'ريال قطري', perUsd: 3.64 },
  { code: 'KWD', symbol: 'د.ك', nameEn: 'Kuwaiti dinar', nameAr: 'دينار كويتي', perUsd: 0.307 },
  { code: 'OMR', symbol: 'ر.ع', nameEn: 'Omani rial', nameAr: 'ريال عُماني', perUsd: 0.3845 },
  { code: 'BHD', symbol: 'د.ب', nameEn: 'Bahraini dinar', nameAr: 'دينار بحريني', perUsd: 0.376 },
  { code: 'JOD', symbol: 'د.أ', nameEn: 'Jordanian dinar', nameAr: 'دينار أردني', perUsd: 0.709 },
  { code: 'IQD', symbol: 'د.ع', nameEn: 'Iraqi dinar', nameAr: 'دينار عراقي', perUsd: 1310 },
  { code: 'LYD', symbol: 'د.ل', nameEn: 'Libyan dinar', nameAr: 'دينار ليبي', perUsd: 5.45 },
  { code: 'YER', symbol: 'ر.ي', nameEn: 'Yemeni rial', nameAr: 'ريال يمني', perUsd: 535 },
  { code: 'SSP', symbol: 'SSP', nameEn: 'South Sudanese pound', nameAr: 'جنيه جنوب سوداني', perUsd: 4500 },
  { code: 'ETB', symbol: 'Br', nameEn: 'Ethiopian birr', nameAr: 'بر إثيوبي', perUsd: 140 },
  { code: 'ERN', symbol: 'Nfk', nameEn: 'Eritrean nakfa', nameAr: 'ناكفا إريتري', perUsd: 15 },
  { code: 'KES', symbol: 'KSh', nameEn: 'Kenyan shilling', nameAr: 'شلن كيني', perUsd: 129 },
  { code: 'UGX', symbol: 'USh', nameEn: 'Ugandan shilling', nameAr: 'شلن أوغندي', perUsd: 3600 },
  { code: 'TZS', symbol: 'TSh', nameEn: 'Tanzanian shilling', nameAr: 'شلن تنزاني', perUsd: 2450 },
  { code: 'SOS', symbol: 'Sh', nameEn: 'Somali shilling', nameAr: 'شلن صومالي', perUsd: 571 },
  { code: 'NGN', symbol: '₦', nameEn: 'Nigerian naira', nameAr: 'نايرا نيجيري', perUsd: 1500 },
  { code: 'GHS', symbol: 'GH₵', nameEn: 'Ghanaian cedi', nameAr: 'سيدي غاني', perUsd: 12 },
  { code: 'XAF', symbol: 'FCFA', nameEn: 'Central African CFA franc', nameAr: 'فرنك وسط أفريقي', perUsd: 565 },
  { code: 'ZAR', symbol: 'R', nameEn: 'South African rand', nameAr: 'راند جنوب أفريقي', perUsd: 17.5 },
  { code: 'MAD', symbol: 'د.م', nameEn: 'Moroccan dirham', nameAr: 'درهم مغربي', perUsd: 9.1 },
  { code: 'TND', symbol: 'د.ت', nameEn: 'Tunisian dinar', nameAr: 'دينار تونسي', perUsd: 2.95 },
  { code: 'DZD', symbol: 'د.ج', nameEn: 'Algerian dinar', nameAr: 'دينار جزائري', perUsd: 130 },
  { code: 'TRY', symbol: '₺', nameEn: 'Turkish lira', nameAr: 'ليرة تركية', perUsd: 41 },
  { code: 'PKR', symbol: '₨', nameEn: 'Pakistani rupee', nameAr: 'روبية باكستانية', perUsd: 282 },
  { code: 'INR', symbol: '₹', nameEn: 'Indian rupee', nameAr: 'روبية هندية', perUsd: 88 },
  { code: 'BDT', symbol: '৳', nameEn: 'Bangladeshi taka', nameAr: 'تاكا بنغلاديشي', perUsd: 122 },
  { code: 'IDR', symbol: 'Rp', nameEn: 'Indonesian rupiah', nameAr: 'روبية إندونيسية', perUsd: 16500 },
  { code: 'MYR', symbol: 'RM', nameEn: 'Malaysian ringgit', nameAr: 'رينغيت ماليزي', perUsd: 4.2 },
  { code: 'PHP', symbol: '₱', nameEn: 'Philippine peso', nameAr: 'بيزو فلبيني', perUsd: 58 },
  { code: 'EUR', symbol: '€', nameEn: 'Euro', nameAr: 'يورو', perUsd: 0.86 },
  { code: 'GBP', symbol: '£', nameEn: 'British pound', nameAr: 'جنيه إسترليني', perUsd: 0.75 },
  { code: 'AUD', symbol: 'A$', nameEn: 'Australian dollar', nameAr: 'دولار أسترالي', perUsd: 1.52 },
  { code: 'CAD', symbol: 'C$', nameEn: 'Canadian dollar', nameAr: 'دولار كندي', perUsd: 1.38 },
  { code: 'MXN', symbol: 'MX$', nameEn: 'Mexican peso', nameAr: 'بيزو مكسيكي', perUsd: 18.5 },
  { code: 'BRL', symbol: 'R$', nameEn: 'Brazilian real', nameAr: 'ريال برازيلي', perUsd: 5.4 },
]

export const getCurrency = (code: string) => currencies.find((c) => c.code === code)
/** Indicative local units per 1 USD (1 for unknown codes). */
export const defaultFx = (code: string) => getCurrency(code)?.perUsd ?? 1
export const currencyName = (code: string, lang: 'en' | 'ar') => { const c = getCurrency(code); return c ? (lang === 'ar' ? c.nameAr : c.nameEn) : code }
