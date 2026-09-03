/**
 * Phone model catalog: approximate native portrait resolutions (physical pixels).
 * These are close, widely-cited values meant to produce a correctly-cropped
 * wallpaper — not manufacturer-certified specs. Use "Custom size" for an exact match.
 */
const PHONE_CATALOG = [
  {
    brand: 'Apple iPhone',
    models: [
      { id: 'iphone-16-pro-max', name: 'iPhone 16 Pro Max', w: 1320, h: 2868 },
      { id: 'iphone-16-pro', name: 'iPhone 16 Pro', w: 1206, h: 2622 },
      { id: 'iphone-16-plus', name: 'iPhone 16 Plus / 15 Plus / 15 Pro Max', w: 1290, h: 2796 },
      { id: 'iphone-16', name: 'iPhone 16 / 15 / 15 Pro', w: 1179, h: 2556 },
      { id: 'iphone-14-pro-max', name: 'iPhone 14 Pro Max / 13 Pro Max', w: 1284, h: 2778 },
      { id: 'iphone-14', name: 'iPhone 14 / 13 / 13 Pro', w: 1170, h: 2532 },
      { id: 'iphone-13-mini', name: 'iPhone 13 mini / 12 mini', w: 1080, h: 2340 },
      { id: 'iphone-11', name: 'iPhone 11 / XR', w: 828, h: 1792 },
      { id: 'iphone-se', name: 'iPhone SE (2nd/3rd gen)', w: 750, h: 1334 },
    ],
  },
  {
    brand: 'Samsung Galaxy',
    models: [
      { id: 'galaxy-s24-ultra', name: 'Galaxy S24 Ultra / S23 Ultra', w: 1440, h: 3120 },
      { id: 'galaxy-s24-plus', name: 'Galaxy S24+ / S23+', w: 1440, h: 3120 },
      { id: 'galaxy-s24', name: 'Galaxy S24 / S23', w: 1080, h: 2340 },
      { id: 'galaxy-a-series', name: 'Galaxy A-series (A54/A55 etc.)', w: 1080, h: 2340 },
      { id: 'galaxy-z-fold-cover', name: 'Galaxy Z Fold (cover screen)', w: 968, h: 2376 },
    ],
  },
  {
    brand: 'Google Pixel',
    models: [
      { id: 'pixel-9-pro-xl', name: 'Pixel 9 Pro XL', w: 1344, h: 2992 },
      { id: 'pixel-9-pro', name: 'Pixel 9 Pro / 8 Pro', w: 1280, h: 2856 },
      { id: 'pixel-9', name: 'Pixel 9 / 8 / 7', w: 1080, h: 2400 },
      { id: 'pixel-7a', name: 'Pixel 7a / 6a', w: 1080, h: 2400 },
    ],
  },
  {
    brand: 'OnePlus',
    models: [
      { id: 'oneplus-12', name: 'OnePlus 12', w: 1440, h: 3168 },
      { id: 'oneplus-11', name: 'OnePlus 11', w: 1440, h: 3216 },
      { id: 'oneplus-nord', name: 'OnePlus Nord series', w: 1080, h: 2400 },
    ],
  },
  {
    brand: 'Xiaomi / Other Android',
    models: [
      { id: 'xiaomi-14', name: 'Xiaomi 14 / 13', w: 1200, h: 2670 },
      { id: 'android-qhd', name: 'Generic Android (QHD+)', w: 1440, h: 3200 },
      { id: 'android-fhd', name: 'Generic Android (FHD+)', w: 1080, h: 2400 },
    ],
  },
  {
    brand: 'Tablet & Desktop',
    models: [
      { id: 'ipad-pro-13', name: 'iPad Pro 13"', w: 2064, h: 2752 },
      { id: 'ipad-10', name: 'iPad (10th gen)', w: 1640, h: 2360 },
      { id: 'desktop-1080', name: 'Desktop (1920×1080)', w: 1920, h: 1080 },
      { id: 'desktop-4k', name: 'Desktop (4K, 3840×2160)', w: 3840, h: 2160 },
    ],
  },
];

const CUSTOM_PHONE = { id: 'custom', name: 'Custom size…', w: 1080, h: 2400 };
