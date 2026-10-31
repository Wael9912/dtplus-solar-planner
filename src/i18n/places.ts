// Arabic names for the location database (keyed by location id / English country name). Used only for display.
import type { Location } from '../engine/types'

export const cityAr: Record<string, string> = {
  algiers: 'الجزائر العاصمة', ndjamena: 'إنجامينا', alexandria: 'الإسكندرية', aswan: 'أسوان', cairo: 'القاهرة', asmara: 'أسمرة', 'addis-ababa': 'أديس أبابا', accra: 'أكرا',
  mombasa: 'مومباسا', nairobi: 'نيروبي', tripoli: 'طرابلس', casablanca: 'الدار البيضاء', abuja: 'أبوجا', kano: 'كانو', lagos: 'لاغوس', mogadishu: 'مقديشو',
  'cape-town': 'كيب تاون', johannesburg: 'جوهانسبرغ', juba: 'جوبا', atbara: 'عطبرة', dongola: 'دنقلا', 'el-obeid': 'الأبيض', kassala: 'كسلا', khartoum: 'الخرطوم',
  nyala: 'نيالا', 'port-sudan': 'بورتسودان', 'wad-madani': 'ود مدني', 'dar-es-salaam': 'دار السلام', tunis: 'تونس', kampala: 'كمبالا', manama: 'المنامة', baghdad: 'بغداد',
  basra: 'البصرة', amman: 'عمّان', 'kuwait-city': 'مدينة الكويت', muscat: 'مسقط', doha: 'الدوحة', dammam: 'الدمام', jeddah: 'جدة', riyadh: 'الرياض',
  'abu-dhabi': 'أبوظبي', dubai: 'دبي', aden: 'عدن', sanaa: 'صنعاء', perth: 'بيرث', sydney: 'سيدني', dhaka: 'دكا', 'sao-paulo': 'ساو باولو',
  toronto: 'تورونتو', paris: 'باريس', berlin: 'برلين', mumbai: 'مومباي', delhi: 'نيودلهي', jakarta: 'جاكرتا', rome: 'روما', 'kuala-lumpur': 'كوالالمبور',
  'mexico-city': 'مكسيكو سيتي', karachi: 'كراتشي', lahore: 'لاهور', manila: 'مانيلا', madrid: 'مدريد', ankara: 'أنقرة', istanbul: 'إسطنبول', london: 'لندن',
  denver: 'دنفر', houston: 'هيوستن', 'los-angeles': 'لوس أنجلوس', miami: 'ميامي', 'new-york': 'نيويورك', phoenix: 'فينيكس',
}

export const countryAr: Record<string, string> = {
  Algeria: 'الجزائر', Chad: 'تشاد', Egypt: 'مصر', Eritrea: 'إريتريا', Ethiopia: 'إثيوبيا', Ghana: 'غانا', Kenya: 'كينيا', Libya: 'ليبيا', Morocco: 'المغرب', Nigeria: 'نيجيريا',
  Somalia: 'الصومال', 'South Africa': 'جنوب أفريقيا', 'South Sudan': 'جنوب السودان', Sudan: 'السودان', Tanzania: 'تنزانيا', Tunisia: 'تونس', Uganda: 'أوغندا',
  Bahrain: 'البحرين', Iraq: 'العراق', Jordan: 'الأردن', Kuwait: 'الكويت', Oman: 'عُمان', Qatar: 'قطر', 'Saudi Arabia': 'السعودية', UAE: 'الإمارات', Yemen: 'اليمن',
  Australia: 'أستراليا', Bangladesh: 'بنغلاديش', Brazil: 'البرازيل', Canada: 'كندا', France: 'فرنسا', Germany: 'ألمانيا', India: 'الهند', Indonesia: 'إندونيسيا',
  Italy: 'إيطاليا', Malaysia: 'ماليزيا', Mexico: 'المكسيك', Pakistan: 'باكستان', Philippines: 'الفلبين', Spain: 'إسبانيا', Turkey: 'تركيا', UK: 'المملكة المتحدة', USA: 'الولايات المتحدة',
}

export const cityName = (l: Pick<Location, 'id' | 'city'>, lang: 'en' | 'ar') => (lang === 'ar' ? cityAr[l.id] ?? l.city : l.city)
export const countryName = (country: string, lang: 'en' | 'ar') => (lang === 'ar' ? countryAr[country] ?? country : country)
export const placeName = (l: Pick<Location, 'id' | 'city' | 'country'>, lang: 'en' | 'ar') => `${cityName(l, lang)}${lang === 'ar' ? '، ' : ', '}${countryName(l.country, lang)}`
