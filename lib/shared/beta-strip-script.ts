// The beta strip's dismissal (components/shared/beta-strip.tsx): a cookie, read
// before first paint by this script in the root layout's <head>, which marks
// <html data-beta-dismissed> so app/globals.css hides the strip. It also moves
// the older localStorage flag into the cookie once. A plain module, so the
// server layout can inline the string.

export const BETA_STRIP_COOKIE = "rails-beta-strip-dismissed";
const LEGACY_STORAGE_KEY = "rails-beta-strip-dismissed";

export const BETA_STRIP_SCRIPT = `(function(){try{var d=document.documentElement;if(document.cookie.split('; ').indexOf('${BETA_STRIP_COOKIE}=1')<0){if(localStorage.getItem('${LEGACY_STORAGE_KEY}')!=='1')return;document.cookie='${BETA_STRIP_COOKIE}=1; path=/; max-age=31536000; samesite=lax';localStorage.removeItem('${LEGACY_STORAGE_KEY}')}d.dataset.betaDismissed='1'}catch(e){}})()`;
