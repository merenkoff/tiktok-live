// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// scripts/gen-demo-grocery.mjs — regenerates public/demo-grocery/*.svg.
//
// The demo grocery (migration 076) needs a picture per product, the same way
// the clothing, flowers and café demos do: flat vector drawings, nothing to
// license, shipped inside the image under public/ (already mounted at '/'),
// editable text instead of base64 in a migration.
//
// One file per PRODUCT, not per variant: the picture hangs on
// `pos_products.image_url`. No lettering on any of them — a word drawn into a
// picture is a font the browser may not have.
//
//   node scripts/gen-demo-grocery.mjs public/demo-grocery
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
if (!OUT) {
  console.error('usage: node scripts/gen-demo-grocery.mjs <out-dir>');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const BG = '#F7F5F1';

function card(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240" role="img"><rect width="240" height="240" rx="18" fill="${BG}"/>${inner}</svg>\n`;
}

/** A soft shadow under whatever stands on the card. */
const shadow = (cx = 120, cy = 200, rx = 78) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="9" fill="#000" opacity="0.06"/>`;

const drawings = {
  // A wedge of hard cheese: the top face lighter than the cut, holes on both.
  cheese: () =>
    card(
      shadow(120, 196, 86) +
        `<path d="M36 150 L118 84 L204 116 L204 190 L36 190 Z" fill="#E9B33E"/>` +
        `<path d="M36 150 L118 84 L204 116 L122 150 Z" fill="#F6D06A"/>` +
        `<path d="M122 150 L204 116 L204 190 L122 190 Z" fill="#DCA332"/>` +
        `<circle cx="70" cy="168" r="9" fill="#C98F25"/><circle cx="100" cy="178" r="5" fill="#C98F25"/>` +
        `<circle cx="158" cy="160" r="8" fill="#B98322"/><circle cx="184" cy="176" r="5" fill="#B98322"/>` +
        `<ellipse cx="112" cy="118" rx="9" ry="5" fill="#E2B54D"/><ellipse cx="150" cy="128" rx="6" ry="3.5" fill="#E2B54D"/>`
    ),

  // A pink boiled sausage tied at both ends, one round cut in front.
  'sausage-boiled': () =>
    card(
      shadow(120, 186, 84) +
        `<rect x="34" y="96" width="160" height="60" rx="30" fill="#E7A29C"/>` +
        `<rect x="34" y="96" width="160" height="16" rx="8" fill="#F0BAB4" opacity="0.7"/>` +
        `<path d="M34 126 L22 116 M34 126 L22 136" stroke="#9B6B4A" stroke-width="4" stroke-linecap="round"/>` +
        `<circle cx="178" cy="150" r="34" fill="#F4C3BD" stroke="#D88E87" stroke-width="5"/>` +
        `<circle cx="168" cy="142" r="3" fill="#FBE3DF"/><circle cx="186" cy="156" r="3" fill="#FBE3DF"/><circle cx="174" cy="162" r="2.5" fill="#FBE3DF"/>`
    ),

  // Dry-cured salami: dark, flecked with fat, one slice cut off.
  salami: () =>
    card(
      shadow(120, 186, 84) +
        `<rect x="30" y="98" width="150" height="54" rx="27" fill="#8C2E2B"/>` +
        `<rect x="30" y="98" width="150" height="54" rx="27" fill="none" stroke="#E9DCCB" stroke-width="3" stroke-dasharray="2 10" opacity="0.8"/>` +
        `<circle cx="70" cy="118" r="3" fill="#F3E4D6"/><circle cx="96" cy="134" r="3.5" fill="#F3E4D6"/><circle cx="124" cy="116" r="3" fill="#F3E4D6"/><circle cx="150" cy="136" r="3" fill="#F3E4D6"/>` +
        `<circle cx="182" cy="150" r="32" fill="#B23F38" stroke="#7A2522" stroke-width="5"/>` +
        `<circle cx="172" cy="142" r="4" fill="#F6E7DA"/><circle cx="192" cy="152" r="3.5" fill="#F6E7DA"/><circle cx="180" cy="164" r="3" fill="#F6E7DA"/><circle cx="194" cy="136" r="2.5" fill="#F6E7DA"/>`
    ),

  potato: () =>
    card(
      shadow(120, 190, 86) +
        `<ellipse cx="88" cy="146" rx="46" ry="34" fill="#C49A63" transform="rotate(-12 88 146)"/>` +
        `<ellipse cx="156" cy="152" rx="42" ry="31" fill="#B98D57" transform="rotate(14 156 152)"/>` +
        `<ellipse cx="122" cy="110" rx="38" ry="28" fill="#CFA772"/>` +
        `<g fill="#9C7442"><circle cx="72" cy="140" r="3"/><circle cx="100" cy="158" r="2.5"/><circle cx="150" cy="146" r="3"/><circle cx="172" cy="164" r="2.5"/><circle cx="112" cy="104" r="2.5"/><circle cx="136" cy="116" r="3"/></g>`
    ),

  carrot: () =>
    card(
      shadow(120, 196, 70) +
        `<path d="M86 80 Q120 70 150 84 L124 196 Q120 204 116 196 Z" fill="#EE8A2E"/>` +
        `<path d="M96 104 L126 108 M100 132 L124 134 M106 160 L122 160" stroke="#C86A17" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="M118 82 Q100 46 86 40 M120 80 Q124 40 132 30 M122 82 Q146 50 162 46" stroke="#5E9F3E" stroke-width="7" fill="none" stroke-linecap="round"/>`
    ),

  onion: () =>
    card(
      shadow(120, 196, 64) +
        `<path d="M120 60 Q178 104 168 152 Q160 192 120 194 Q80 192 72 152 Q62 104 120 60 Z" fill="#D69D52"/>` +
        `<path d="M120 64 Q140 120 136 192 M120 64 Q100 120 104 192 M120 62 Q160 110 156 180 M120 62 Q80 110 84 180" stroke="#B57D36" stroke-width="3" fill="none"/>` +
        `<path d="M114 62 Q118 40 112 26 M126 62 Q124 42 132 30" stroke="#8C9E4A" stroke-width="5" fill="none" stroke-linecap="round"/>`
    ),

  tomato: () =>
    card(
      shadow(120, 198, 70) +
        `<circle cx="120" cy="134" r="62" fill="#E04A3C"/>` +
        `<ellipse cx="98" cy="110" rx="16" ry="10" fill="#F07A6C" opacity="0.7"/>` +
        `<path d="M120 76 L108 64 L122 70 L132 58 L130 74 L148 72 L134 82 L120 90 L104 84 L92 78 Z" fill="#4E9A3A"/>`
    ),

  cucumber: () =>
    card(
      shadow(120, 194, 84) +
        `<rect x="40" y="88" width="168" height="42" rx="21" fill="#4F8F3C" transform="rotate(-16 124 109)"/>` +
        `<rect x="34" y="132" width="166" height="40" rx="20" fill="#5FA548" transform="rotate(8 117 152)"/>` +
        `<g fill="#9CCB7E"><circle cx="70" cy="114" r="2.5"/><circle cx="104" cy="104" r="2.5"/><circle cx="140" cy="94" r="2.5"/><circle cx="174" cy="86" r="2.5"/><circle cx="66" cy="148" r="2.5"/><circle cx="104" cy="152" r="2.5"/><circle cx="142" cy="157" r="2.5"/><circle cx="178" cy="162" r="2.5"/></g>`
    ),

  // Golden apple — the card's first variety.
  apple: () =>
    card(
      shadow(120, 198, 66) +
        `<path d="M120 84 Q90 66 70 86 Q50 110 62 150 Q76 196 104 194 Q114 192 120 186 Q126 192 136 194 Q164 196 178 150 Q190 110 170 86 Q150 66 120 84 Z" fill="#E7C342"/>` +
        `<ellipse cx="92" cy="112" rx="12" ry="18" fill="#F3DA77" opacity="0.8"/>` +
        `<path d="M120 86 Q118 64 126 50" stroke="#7A5530" stroke-width="5" fill="none" stroke-linecap="round"/>` +
        `<path d="M126 60 Q146 44 164 52 Q148 70 126 60 Z" fill="#5E9F3E"/>`
    ),

  banana: () =>
    card(
      shadow(120, 190, 82) +
        `<path d="M54 86 Q66 170 156 176 Q178 176 186 168 Q120 160 92 92 Z" fill="#F2CF4A"/>` +
        `<path d="M64 80 Q90 150 170 152 Q190 150 196 140 Q130 138 100 84 Z" fill="#F6DA62"/>` +
        `<path d="M76 72 Q116 128 186 124 Q200 120 204 110 Q140 116 110 74 Z" fill="#F9E27A"/>` +
        `<path d="M50 84 L60 72 L112 70 L116 80" stroke="#6E5022" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    ),

  // Wrapped sweets with twisted ends, the way they are weighed out of a box.
  candy: () => {
    const sweet = (cx, cy, rot, body, band) =>
      `<g transform="rotate(${rot} ${cx} ${cy})">` +
      `<path d="M${cx - 38} ${cy - 16} L${cx - 22} ${cy} L${cx - 38} ${cy + 16} Z" fill="${body}"/>` +
      `<path d="M${cx + 38} ${cy - 16} L${cx + 22} ${cy} L${cx + 38} ${cy + 16} Z" fill="${body}"/>` +
      `<rect x="${cx - 24}" y="${cy - 18}" width="48" height="36" rx="16" fill="${body}"/>` +
      `<circle cx="${cx}" cy="${cy}" r="9" fill="${band}"/>` +
      `<g fill="#FFFFFF">${[0, 60, 120, 180, 240, 300]
        .map((a) => `<ellipse cx="${cx}" cy="${cy - 13}" rx="3" ry="5" transform="rotate(${a} ${cx} ${cy})"/>`)
        .join('')}</g>` +
      `</g>`;
    return card(
      shadow(120, 194, 84) +
        sweet(84, 150, -18, '#4E8FCF', '#F2C94C') +
        sweet(158, 156, 14, '#5FA548', '#F2C94C') +
        sweet(120, 104, 4, '#E05A7A', '#F2C94C')
    );
  },

  // Draught kvass: a mug with a head of foam.
  kvass: () =>
    card(
      shadow(110, 198, 60) +
        `<path d="M66 82 L150 82 L144 192 L72 192 Z" fill="#8A4A1E"/>` +
        `<path d="M66 82 L150 82 L148 108 L68 108 Z" fill="#A5602C"/>` +
        `<path d="M150 104 Q186 104 186 140 Q186 176 146 176" stroke="#D9C6A5" stroke-width="12" fill="none"/>` +
        `<path d="M58 84 Q62 60 86 66 Q96 50 116 60 Q134 48 150 64 Q168 66 160 86 Z" fill="#F4E6C8"/>` +
        `<rect x="78" y="118" width="8" height="58" rx="4" fill="#B97A45" opacity="0.6"/>`
    ),

  // A gable-top carton with a blue band and a drop.
  milk: () =>
    card(
      shadow(120, 200, 52) +
        `<path d="M78 74 L120 44 L162 74 Z" fill="#E6EEF7"/>` +
        `<rect x="112" y="36" width="16" height="12" rx="2" fill="#CFDDEE"/>` +
        `<rect x="78" y="74" width="84" height="122" fill="#FFFFFF" stroke="#D6E0EC" stroke-width="2"/>` +
        `<rect x="78" y="130" width="84" height="34" fill="#3D7BC4"/>` +
        `<path d="M120 92 Q136 112 128 124 Q120 132 112 124 Q104 112 120 92 Z" fill="#7FB0E6"/>`
    ),

  // A bottle of kefir with a green cap and band.
  kefir: () =>
    card(
      shadow(120, 202, 48) +
        `<rect x="104" y="34" width="32" height="18" rx="4" fill="#4E9A3A"/>` +
        `<path d="M108 52 L132 52 L136 74 Q160 86 160 112 L160 186 Q160 198 148 198 L92 198 Q80 198 80 186 L80 112 Q80 86 104 74 Z" fill="#FFFFFF" stroke="#D9DED6" stroke-width="2"/>` +
        `<rect x="80" y="124" width="80" height="40" fill="#6DB257"/>` +
        `<circle cx="120" cy="144" r="10" fill="#FFFFFF"/>`
    ),

  // A block of butter, its foil folded back.
  butter: () =>
    card(
      shadow(120, 186, 80) +
        `<path d="M44 124 L124 92 L200 116 L120 150 Z" fill="#F7DE85"/>` +
        `<path d="M44 124 L120 150 L120 184 L44 158 Z" fill="#EFCB5A"/>` +
        `<path d="M120 150 L200 116 L200 150 L120 184 Z" fill="#E4BC4A"/>` +
        `<path d="M44 124 L44 158 L120 184 L120 168 L60 148 L60 128 Z" fill="#C9A23E"/>` +
        `<path d="M200 116 L200 150 L170 162 L170 130 Z" fill="#D7B04C"/>`
    ),

  // Ten eggs in a carton, six showing.
  eggs: () => {
    const egg = (cx, cy) =>
      `<ellipse cx="${cx}" cy="${cy}" rx="18" ry="22" fill="#F3E3C8"/><ellipse cx="${cx - 6}" cy="${cy - 8}" rx="5" ry="7" fill="#FBF1E1"/>`;
    return card(
      shadow(120, 190, 90) +
        `<rect x="32" y="128" width="176" height="56" rx="10" fill="#C9C1B3"/>` +
        `<path d="M32 140 Q46 124 60 140 Q74 124 88 140 Q102 124 116 140 Q130 124 144 140 Q158 124 172 140 Q186 124 200 140 L208 140" stroke="#B3AA9A" stroke-width="3" fill="none"/>` +
        egg(58, 116) + egg(98, 112) + egg(138, 116) + egg(178, 112) +
        `<rect x="32" y="146" width="176" height="38" rx="8" fill="#BDB4A5"/>`
    );
  },

  // A brick of dark rye bread, scored on top.
  'bread-rye': () =>
    card(
      shadow(120, 190, 86) +
        `<path d="M40 112 Q44 84 80 84 L164 84 Q200 84 202 112 L202 176 Q202 186 192 186 L50 186 Q40 186 40 176 Z" fill="#6E4428"/>` +
        `<path d="M40 112 Q44 84 80 84 L164 84 Q200 84 202 112 Q200 124 120 124 Q42 124 40 112 Z" fill="#8A5734"/>` +
        `<path d="M76 98 L90 112 M112 96 L126 112 M148 98 L162 112" stroke="#5A3520" stroke-width="5" stroke-linecap="round"/>` +
        `<g fill="#A06C42"><circle cx="70" cy="150" r="2"/><circle cx="104" cy="164" r="2"/><circle cx="148" cy="148" r="2"/><circle cx="176" cy="166" r="2"/></g>`
    ),

  // A long white loaf with diagonal cuts — a «батон».
  loaf: () =>
    card(
      shadow(120, 184, 92) +
        `<rect x="26" y="102" width="188" height="66" rx="33" fill="#D99F55" transform="rotate(-6 120 135)"/>` +
        `<rect x="34" y="104" width="172" height="26" rx="13" fill="#E8B873" transform="rotate(-6 120 117)"/>` +
        `<path d="M64 116 L82 136 M98 112 L116 132 M132 108 L150 128 M166 104 L184 124" stroke="#B57C35" stroke-width="5" stroke-linecap="round"/>`
    ),

  // A paper bag of buckwheat with a window onto the grains.
  buckwheat: () =>
    card(
      shadow(120, 202, 56) +
        `<path d="M74 66 L166 66 L174 196 L66 196 Z" fill="#C9A47A"/>` +
        `<path d="M74 66 L166 66 L160 52 L80 52 Z" fill="#B48D62"/>` +
        `<rect x="88" y="104" width="64" height="62" rx="10" fill="#F4EBDD"/>` +
        `<g fill="#8A5A34">${[
          [100, 118], [114, 126], [128, 116], [140, 128], [104, 140], [118, 150], [132, 142], [146, 154], [110, 156], [126, 130],
        ]
          .map(([x, y]) => `<path d="M${x} ${y - 5} L${x + 4} ${y + 3} L${x - 4} ${y + 3} Z"/>`)
          .join('')}</g>`
    ),

  // A white bag of sugar, two cubes beside it.
  sugar: () =>
    card(
      shadow(120, 202, 66) +
        `<path d="M70 70 L150 70 L158 196 L62 196 Z" fill="#FFFFFF" stroke="#D9DEE6" stroke-width="2"/>` +
        `<path d="M70 70 L150 70 L144 56 L76 56 Z" fill="#E9EDF3"/>` +
        `<rect x="74" y="110" width="80" height="44" fill="#3D7BC4"/>` +
        `<rect x="162" y="160" width="28" height="28" rx="4" fill="#FFFFFF" stroke="#CFD6E0" stroke-width="2"/>` +
        `<rect x="176" y="134" width="24" height="24" rx="4" fill="#FFFFFF" stroke="#CFD6E0" stroke-width="2"/>`
    ),

  // A bottle of sunflower oil.
  oil: () =>
    card(
      shadow(120, 204, 50) +
        `<rect x="108" y="30" width="24" height="16" rx="3" fill="#E1A11A"/>` +
        `<path d="M110 46 L130 46 L134 70 Q156 84 156 108 L156 190 Q156 200 146 200 L94 200 Q84 200 84 190 L84 108 Q84 84 106 70 Z" fill="#F4C93A" opacity="0.92"/>` +
        `<rect x="84" y="118" width="72" height="48" fill="#FFFFFF" opacity="0.9"/>` +
        `<circle cx="120" cy="142" r="9" fill="#6E4428"/>` +
        `<g fill="#F2B20F">${[0, 45, 90, 135, 180, 225, 270, 315]
          .map((a) => `<ellipse cx="120" cy="127" rx="4" ry="7" transform="rotate(${a} 120 142)"/>`)
          .join('')}</g>`
    ),

  // A bottle of still water.
  water: () =>
    card(
      shadow(120, 204, 46) +
        `<rect x="108" y="28" width="24" height="16" rx="3" fill="#2E6FB5"/>` +
        `<path d="M110 44 L130 44 L134 66 Q152 78 152 100 L148 124 L152 148 L148 172 L152 188 Q152 202 138 202 L102 202 Q88 202 88 188 L92 172 L88 148 L92 124 L88 100 Q88 78 106 66 Z" fill="#A9D2F0" opacity="0.9"/>` +
        `<rect x="88" y="128" width="64" height="34" fill="#2E6FB5"/>` +
        `<path d="M96 146 Q106 138 116 146 Q126 154 136 146 Q142 142 146 146" stroke="#FFFFFF" stroke-width="3" fill="none" stroke-linecap="round"/>`
    ),
};

for (const [name, draw] of Object.entries(drawings)) {
  writeFileSync(path.join(OUT, `${name}.svg`), draw());
}
console.log(`wrote ${Object.keys(drawings).length} pictures to ${OUT}`);
