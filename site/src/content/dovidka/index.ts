import type { Article } from './types';
import { zminaPrroZaminaKasy } from './zmina-prro-zamina-kasy';
import { yakObratyProgramuDlyaKavyarni } from './yak-obraty-programu-dlya-kavyarni';
import { tehkartaIFudkostKavyarni } from './tehkarta-i-fudkost-kavyarni';
import { kavappChyLiveshopDlyaKavyarni } from './kavapp-chy-liveshop-dlya-kavyarni';
import { expirenzaChyLiveshopDlyaRestoranu } from './expirenza-chy-liveshop-dlya-restoranu';
import { choiceqrChyLiveshopDlyaRestoranu } from './choiceqr-chy-liveshop-dlya-restoranu';
import { restoappChyLiveshopDlyaRestoranu } from './restoapp-chy-liveshop-dlya-restoranu';
import { posterQrChyLiveshopDlyaRestoranu } from './poster-qr-chy-liveshop-dlya-restoranu';
import { prodazhPidZapysOblikBorgiv } from './prodazh-pid-zapys-oblik-borgiv';
import { chyPotribenPrroNaRynku } from './chy-potriben-prro-na-rynku';
import { vagovyiTovarCherezPrro } from './vagovyi-tovar-cherez-prro';
import { GUIDE_ARTICLES } from './guides';

/** Hand-written answers, newest first. */
const STANDALONE: Article[] = [
  vagovyiTovarCherezPrro,
  chyPotribenPrroNaRynku,
  prodazhPidZapysOblikBorgiv,
  posterQrChyLiveshopDlyaRestoranu,
  restoappChyLiveshopDlyaRestoranu,
  expirenzaChyLiveshopDlyaRestoranu,
  choiceqrChyLiveshopDlyaRestoranu,
  kavappChyLiveshopDlyaKavyarni,
  yakObratyProgramuDlyaKavyarni,
  tehkartaIFudkostKavyarni,
  zminaPrroZaminaKasy,
];

/** Guides first (in reading order), then the articles — the index page and llms.txt list them this way. */
export const ARTICLES: Article[] = [...GUIDE_ARTICLES, ...STANDALONE];

export function findArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.meta.slug === slug);
}
