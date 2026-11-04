// Strings for app updates: the "new version" banner, the after-update message and the release notes shown to returning
// devices (src/updates.ts). `notes` keys are package.json versions; a device sees the notes of every version it skipped.
/** First-strong isolate: keeps a number + Latin unit in one LTR island inside an Arabic sentence. */
const I = (x: string) => '\u2068' + x + '\u2069'

export const updatesEn = {
  ready: 'A new version of the app is ready.', update: 'Update now', later: 'Later',
  updated: (v: string) => `The app was updated to version ${v}.`,
  whatsNew: (v: string) => `New in version ${v}`,
  intro: 'The app updated itself. Your projects and settings are kept. Start any of these from the home screen.',
  gotIt: 'Got it',
  check: 'Check for updates', latest: 'You have the latest version.', offline: 'Could not check for updates. Check the connection and try again.',
  notes: {
    '0.2.0': [
      'Load calculator: list the appliances or enter the monthly electricity bill, and get the system size and a rough price on one screen.',
      'Quote a known size: price the system the client already chose (e.g. 5 kW + 10 kWh), battery backup without panels, or an upgrade to equipment already on site.',
      'Product quote: pick products for a counter sale and get a priced quotation.',
      'Engineering tools: string checker, battery bank, cable & breaker and generator — no project needed.',
      'Price list: your own prices, products you don\'t stock and your own products. Quotes already sent keep their prices.',
      'Daily power-cut hours now count in the savings of hybrid systems.',
    ],
    '0.2.1': ['The app now updates itself when a new version is published, and tells you what changed.'],
    '0.3.0': [
      'New home screen: every feature in one place — the load calculator and the four engineering calculators, quotes, and your company — with your latest work at the top.',
      'History: every saved project and quote, one tap away from any screen (the clock button at the top).',
      'Install as an app: tap “Install app” at the top of the Home screen (or in Company settings) to put the planner on your phone or computer. It opens full screen and works without internet.',
    ],
  } as Record<string, readonly string[]>,
}

export const updatesAr: typeof updatesEn = {
  ready: 'نسخة جديدة من التطبيق جاهزة.', update: 'حدّث الآن', later: 'لاحقاً',
  updated: (v) => `تم تحديث التطبيق إلى الإصدار ${I(v)}.`,
  whatsNew: (v) => `الجديد في الإصدار ${I(v)}`,
  intro: 'تم تحديث التطبيق تلقائياً، ومشاريعك وإعداداتك محفوظة. ابدأ أياً من هذه من الشاشة الرئيسية.',
  gotIt: 'حسناً',
  check: 'التحقق من التحديثات', latest: 'لديك أحدث إصدار.', offline: 'تعذّر التحقق من التحديثات. تأكد من الاتصال وحاول مرة أخرى.',
  notes: {
    '0.2.0': [
      'حاسبة الأحمال: أدخل الأجهزة أو استهلاك فاتورة الكهرباء الشهرية، واحصل على حجم النظام وسعر تقريبي في شاشة واحدة.',
      `تسعير نظام محدد الحجم: سعّر النظام الذي اختاره العميل (مثلاً ${I('5 kW + 10 kWh')})، أو بطاريات احتياطية دون ألواح، أو توسعة لمعدات موجودة في الموقع.`,
      'عرض سعر منتجات: اختر المنتجات للبيع المباشر واحصل على عرض سعر.',
      'أدوات هندسية: فحص السلاسل، بنك البطاريات، الكابلات والقواطع، والمولد — دون مشروع.',
      'قائمة الأسعار: أسعارك الخاصة، والمنتجات غير المتوفرة لديك، ومنتجاتك الخاصة. العروض المرسلة تحتفظ بأسعارها.',
      'ساعات انقطاع الشبكة اليومية تُحسب الآن في توفير الأنظمة الهجينة.',
    ],
    '0.2.1': ['يتحدّث التطبيق الآن تلقائياً عند نشر إصدار جديد، ويخبرك بما تغيّر.'],
    '0.3.0': [
      'شاشة رئيسية جديدة: كل الميزات في مكان واحد — حاسبة الأحمال والحاسبات الهندسية الأربع، وعروض الأسعار، وبيانات شركتك — وأحدث أعمالك في الأعلى.',
      'السجل: كل المشاريع وعروض الأسعار المحفوظة، على بُعد نقرة واحدة من أي شاشة (زر الساعة في الأعلى).',
      'ثبّت التطبيق: اضغط «تثبيت التطبيق» أعلى الشاشة الرئيسية للتطبيق (أو في إعدادات الشركة) لوضع المخطط على هاتفك أو حاسوبك. يفتح بملء الشاشة ويعمل دون إنترنت.',
    ],
  },
}
