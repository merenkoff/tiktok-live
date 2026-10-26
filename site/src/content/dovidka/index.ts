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
import { torgsoftPosboxPosterDlyaProduktovogoMagazynu } from './torgsoft-posbox-poster-dlya-produktovogo-magazynu';
import { zaokruglennyaGotivky50Kopiyok } from './zaokruglennya-gotivky-50-kopiyok';
import { programaDlyaKvitkovogoMagazynuChyKasaDlyaKafe } from './programa-dlya-kvitkovogo-magazynu-chy-kasa-dlya-kafe';
import { posterSkynumFlora24DlyaKvitkovogoMagazynu } from './poster-skynum-flora24-dlya-kvitkovogo-magazynu';
import { oblikHeliyuIKulokUKvitkovomuMagazyni } from './oblik-heliyu-i-kulok-u-kvitkovomu-magazyni';
import { oblikPakuvannyaUKvitkovomuMagazyni } from './oblik-pakuvannya-u-kvitkovomu-magazyni';
import { yakObratyProgramuDlyaKvitkovogoMagazynu } from './yak-obraty-programu-dlya-kvitkovogo-magazynu';
import { yakVidkrytyKvitkovyiMagazynFopKvedPrro } from './yak-vidkryty-kvitkovyi-magazyn-fop-kved-prro';
import { yakObratyProgramuDlyaMagazynuOdyagu } from './yak-obraty-programu-dlya-magazynu-odyagu';
import { oblikOdyaguZaRozmiramyIKoloramy } from './oblik-odyagu-za-rozmiramy-i-koloramy';
import { yakVidkrytyMagazynOdyaguFopKvedPrro } from './yak-vidkryty-magazyn-odyagu-fop-kved-prro';
import { torgsoftArm20SkynumDlyaMagazynuOdyagu } from './torgsoft-arm20-skynum-dlya-magazynu-odyagu';
import { povernennyaIObminOdyagu14Dniv } from './povernennya-i-obmin-odyagu-14-dniv';
import { GUIDE_ARTICLES } from './guides';

/** Hand-written answers, newest first. */
const STANDALONE: Article[] = [
  oblikPakuvannyaUKvitkovomuMagazyni,
  oblikHeliyuIKulokUKvitkovomuMagazyni,
  torgsoftArm20SkynumDlyaMagazynuOdyagu,
  povernennyaIObminOdyagu14Dniv,
  yakObratyProgramuDlyaMagazynuOdyagu,
  oblikOdyaguZaRozmiramyIKoloramy,
  yakVidkrytyMagazynOdyaguFopKvedPrro,
  posterSkynumFlora24DlyaKvitkovogoMagazynu,
  programaDlyaKvitkovogoMagazynuChyKasaDlyaKafe,
  yakObratyProgramuDlyaKvitkovogoMagazynu,
  yakVidkrytyKvitkovyiMagazynFopKvedPrro,
  zaokruglennyaGotivky50Kopiyok,
  torgsoftPosboxPosterDlyaProduktovogoMagazynu,
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
