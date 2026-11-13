/**
 * Stock profile pictures: minimal, flat characters drawn as small inline SVGs, so they
 * need no image files, work offline and look the same on every platform. A profile stores
 * only the id (`av-01` ...); the picture is drawn from it here.
 */

interface Colors {
  /** Background of the tile. */
  bg: string;
  fur: string;
  dark: string;
  light: string;
  accent: string;
}

type Draw = (c: Colors) => string;

const INK = '#2b2d42';

const eye = (x: number, y: number, r = 3.6, color = INK) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/><circle cx="${x + r * 0.3}" cy="${y - r * 0.35}" r="${r * 0.32}" fill="#fff"/>`;

const eyes = (y = 52, dx = 13, r = 3.6) => eye(50 - dx, y, r) + eye(50 + dx, y, r);

const smile = (y = 66, w = 7) =>
  `<path d="M${50 - w} ${y}q${w} ${w * 0.9} ${w * 2} 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;

const blush = (y = 62, dx = 19) =>
  `<circle cx="${50 - dx}" cy="${y}" r="4" fill="#ff8fa3" opacity=".45"/><circle cx="${50 + dx}" cy="${y}" r="4" fill="#ff8fa3" opacity=".45"/>`;

const nose = (c: string, y = 60) => `<path d="M45 ${y}q5-4 10 0q-5 6-10 0z" fill="${c}"/>`;

const whiskers = () =>
  `<g stroke="${INK}" stroke-width="1.6" stroke-linecap="round" opacity=".55"><path d="M30 62l-12-2M30 66l-12 3M70 62l12-2M70 66l12 3"/></g>`;

/** Each character, drawn on a 100x100 tile. */
const CRITTERS: { name: string; draw: Draw; looks: [string, string, string, string][] }[] = [
  {
    name: 'cat',
    looks: [
      ['#f4a259', '#c97b2f', '#fde7c7', '#f28482'],
      ['#8d99ae', '#5c677d', '#e9ecef', '#f28482'],
    ],
    draw: (c) =>
      `<path d="M26 46L29 20l18 15z M74 46L71 20L53 35z" fill="${c.fur}"/><path d="M31 38l-1-11 10 7z M69 38l1-11-10 7z" fill="${c.accent}"/><circle cx="50" cy="58" r="27" fill="${c.fur}"/><ellipse cx="50" cy="68" rx="14" ry="10" fill="${c.light}"/>${eyes(54)}${nose(c.accent, 61)}${whiskers()}${smile(68, 5)}`,
  },
  {
    name: 'dog',
    looks: [
      ['#d4a373', '#9c6b3f', '#fdf0d5', '#2b2d42'],
      ['#e9c46a', '#b8892a', '#fff8e1', '#2b2d42'],
    ],
    draw: (c) =>
      `<ellipse cx="26" cy="52" rx="11" ry="20" fill="${c.dark}" transform="rotate(14 26 52)"/><ellipse cx="74" cy="52" rx="11" ry="20" fill="${c.dark}" transform="rotate(-14 74 52)"/><circle cx="50" cy="52" r="26" fill="${c.fur}"/><ellipse cx="50" cy="63" rx="15" ry="12" fill="${c.light}"/>${eyes(48)}<ellipse cx="50" cy="58" rx="6" ry="4.5" fill="${c.accent}"/>${smile(68, 6)}<path d="M50 62v5" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
  },
  {
    name: 'fox',
    looks: [
      ['#f77f00', '#bf5b00', '#fff1e0', '#2b2d42'],
      ['#7b8cde', '#4b5bb0', '#eef0ff', '#2b2d42'],
    ],
    draw: (c) =>
      `<path d="M20 48L24 18l22 18z M80 48L76 18L54 36z" fill="${c.fur}"/><path d="M24 18l3 8-7 3z M76 18l-3 8 7 3z" fill="${c.accent}"/><path d="M50 84L18 52q-3-18 12-22q20-5 40 0q15 4 12 22z" fill="${c.fur}"/><path d="M50 84L28 60q22 4 44 0z" fill="${c.light}"/>${eyes(50, 14)}<circle cx="50" cy="76" r="3.6" fill="${c.accent}"/>`,
  },
  {
    name: 'bear',
    looks: [
      ['#a47148', '#7a4f2b', '#e9c9a3', '#2b2d42'],
      ['#9aa5b1', '#6b7785', '#e8edf2', '#2b2d42'],
    ],
    draw: (c) =>
      `<circle cx="27" cy="30" r="11" fill="${c.fur}"/><circle cx="73" cy="30" r="11" fill="${c.fur}"/><circle cx="27" cy="30" r="5.5" fill="${c.light}"/><circle cx="73" cy="30" r="5.5" fill="${c.light}"/><circle cx="50" cy="54" r="29" fill="${c.fur}"/><ellipse cx="50" cy="64" rx="13" ry="10" fill="${c.light}"/>${eyes(50)}<ellipse cx="50" cy="60" rx="5" ry="3.6" fill="${c.accent}"/>${smile(68, 5)}`,
  },
  {
    name: 'panda',
    looks: [
      ['#ffffff', '#2b2d42', '#ffffff', '#2b2d42'],
      ['#ffe9c7', '#3d405b', '#fffdf7', '#3d405b'],
    ],
    draw: (c) =>
      `<circle cx="27" cy="30" r="11" fill="${c.dark}"/><circle cx="73" cy="30" r="11" fill="${c.dark}"/><circle cx="50" cy="54" r="29" fill="#fff"/><ellipse cx="37" cy="51" rx="8" ry="10" fill="${c.dark}" transform="rotate(-18 37 51)"/><ellipse cx="63" cy="51" rx="8" ry="10" fill="${c.dark}" transform="rotate(18 63 51)"/><circle cx="38" cy="50" r="3" fill="#fff"/><circle cx="62" cy="50" r="3" fill="#fff"/><ellipse cx="50" cy="62" rx="5" ry="3.6" fill="${c.dark}"/>${smile(68, 5)}`,
  },
  {
    name: 'rabbit',
    looks: [
      ['#f1f1f1', '#d9d9d9', '#ffffff', '#f4a6b8'],
      ['#d7b899', '#a98467', '#f3e5d4', '#f4a6b8'],
    ],
    draw: (c) =>
      `<ellipse cx="38" cy="26" rx="8" ry="22" fill="${c.fur}"/><ellipse cx="62" cy="26" rx="8" ry="22" fill="${c.fur}"/><ellipse cx="38" cy="27" rx="3.6" ry="16" fill="${c.accent}"/><ellipse cx="62" cy="27" rx="3.6" ry="16" fill="${c.accent}"/><circle cx="50" cy="62" r="25" fill="${c.fur}"/>${eyes(58, 11)}${nose(c.accent, 65)}${smile(72, 4)}${blush(67, 17)}`,
  },
  {
    name: 'owl',
    looks: [
      ['#8d6e63', '#5d4037', '#efebe9', '#f9a825'],
      ['#7e8ce0', '#4f5bb0', '#eceeff', '#f9a825'],
    ],
    draw: (c) =>
      `<path d="M22 40L20 18l18 10z M78 40L80 18L62 28z" fill="${c.dark}"/><ellipse cx="50" cy="58" rx="30" ry="32" fill="${c.fur}"/><ellipse cx="50" cy="72" rx="17" ry="16" fill="${c.light}" opacity=".85"/><circle cx="36" cy="48" r="12" fill="#fff"/><circle cx="64" cy="48" r="12" fill="#fff"/><circle cx="36" cy="49" r="5.5" fill="${INK}"/><circle cx="64" cy="49" r="5.5" fill="${INK}"/><circle cx="37.6" cy="47" r="1.8" fill="#fff"/><circle cx="65.6" cy="47" r="1.8" fill="#fff"/><path d="M45 58h10l-5 10z" fill="${c.accent}"/>`,
  },
  {
    name: 'penguin',
    looks: [
      ['#3d5a80', '#22303c', '#ffffff', '#ff9f1c'],
      ['#6d6875', '#3b3a40', '#fdfcfc', '#ff9f1c'],
    ],
    draw: (c) =>
      `<ellipse cx="50" cy="56" rx="29" ry="33" fill="${c.dark}"/><ellipse cx="50" cy="64" rx="19" ry="24" fill="${c.light}"/><circle cx="40" cy="46" r="3.6" fill="#fff"/><circle cx="60" cy="46" r="3.6" fill="#fff"/><circle cx="40.6" cy="46.6" r="1.8" fill="${INK}"/><circle cx="59.4" cy="46.6" r="1.8" fill="${INK}"/><path d="M43 53h14l-7 9z" fill="${c.accent}"/>`,
  },
  {
    name: 'frog',
    looks: [
      ['#80b918', '#538d22', '#d9f0a3', '#ef476f'],
      ['#2ec4b6', '#1b8f85', '#cdf5f0', '#ef476f'],
    ],
    draw: (c) =>
      `<circle cx="32" cy="34" r="13" fill="${c.fur}"/><circle cx="68" cy="34" r="13" fill="${c.fur}"/><ellipse cx="50" cy="60" rx="31" ry="25" fill="${c.fur}"/><circle cx="32" cy="34" r="8" fill="#fff"/><circle cx="68" cy="34" r="8" fill="#fff"/><circle cx="33" cy="35" r="4" fill="${INK}"/><circle cx="67" cy="35" r="4" fill="${INK}"/><path d="M30 64q20 16 40 0" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><circle cx="43" cy="56" r="1.6" fill="${c.dark}"/><circle cx="57" cy="56" r="1.6" fill="${c.dark}"/>${blush(66, 24)}`,
  },
  {
    name: 'lion',
    looks: [
      ['#e9a23b', '#b36b0c', '#fcd790', '#7a3b0c'],
      ['#e07a5f', '#a8452c', '#f9c7b8', '#7a2e1a'],
    ],
    draw: (c) =>
      `<circle cx="50" cy="52" r="34" fill="${c.dark}"/><circle cx="26" cy="30" r="7" fill="${c.dark}"/><circle cx="74" cy="30" r="7" fill="${c.dark}"/><circle cx="50" cy="54" r="23" fill="${c.fur}"/><ellipse cx="50" cy="63" rx="11" ry="8" fill="${c.light}"/>${eyes(50, 10)}${nose(c.accent, 58)}${smile(67, 4)}`,
  },
  {
    name: 'monkey',
    looks: [
      ['#9c6644', '#6f4518', '#f2d0a9', '#2b2d42'],
      ['#8d99ae', '#5c677d', '#e9d8c4', '#2b2d42'],
    ],
    draw: (c) =>
      `<circle cx="22" cy="52" r="10" fill="${c.fur}"/><circle cx="78" cy="52" r="10" fill="${c.fur}"/><circle cx="22" cy="52" r="5" fill="${c.light}"/><circle cx="78" cy="52" r="5" fill="${c.light}"/><circle cx="50" cy="52" r="28" fill="${c.fur}"/><path d="M50 40q-22-8-24 12q0 18 24 20q24-2 24-20q-2-20-24-12z" fill="${c.light}"/>${eyes(52, 10)}<circle cx="46" cy="64" r="1.6" fill="${c.dark}"/><circle cx="54" cy="64" r="1.6" fill="${c.dark}"/>${smile(68, 6)}`,
  },
  {
    name: 'koala',
    looks: [
      ['#a2aebb', '#6c7a89', '#eef2f6', '#2b2d42'],
      ['#b8a99a', '#85766a', '#f3ece4', '#2b2d42'],
    ],
    draw: (c) =>
      `<circle cx="24" cy="38" r="15" fill="${c.fur}"/><circle cx="76" cy="38" r="15" fill="${c.fur}"/><circle cx="24" cy="38" r="8" fill="${c.light}"/><circle cx="76" cy="38" r="8" fill="${c.light}"/><circle cx="50" cy="56" r="27" fill="${c.fur}"/>${eyes(52, 12)}<ellipse cx="50" cy="62" rx="7" ry="9" fill="${c.accent}"/>`,
  },
  {
    name: 'pig',
    looks: [
      ['#f4a6b8', '#e0788f', '#f9c6d2', '#c9475f'],
      ['#cdb4db', '#9b7cb6', '#e5d4ee', '#7b4b94'],
    ],
    draw: (c) =>
      `<path d="M26 40L30 18l17 14z M74 40L70 18L53 32z" fill="${c.dark}"/><circle cx="50" cy="55" r="29" fill="${c.fur}"/><ellipse cx="50" cy="64" rx="13" ry="10" fill="${c.light}"/><ellipse cx="45" cy="64" rx="2.4" ry="3.4" fill="${c.accent}"/><ellipse cx="55" cy="64" rx="2.4" ry="3.4" fill="${c.accent}"/>${eyes(50, 14)}${blush(58, 24)}`,
  },
  {
    name: 'mouse',
    looks: [
      ['#b0b7c3', '#808896', '#eceff4', '#f4a6b8'],
      ['#e0b88f', '#b58553', '#f7e6d3', '#f4a6b8'],
    ],
    draw: (c) =>
      `<circle cx="26" cy="32" r="16" fill="${c.fur}"/><circle cx="74" cy="32" r="16" fill="${c.fur}"/><circle cx="26" cy="32" r="10" fill="${c.accent}"/><circle cx="74" cy="32" r="10" fill="${c.accent}"/><ellipse cx="50" cy="58" rx="25" ry="26" fill="${c.fur}"/><ellipse cx="50" cy="70" rx="12" ry="9" fill="${c.light}"/>${eyes(54, 11)}<circle cx="50" cy="63" r="3.4" fill="${c.accent}"/>${whiskers()}`,
  },
  {
    name: 'tiger',
    looks: [
      ['#f08a24', '#b85f0a', '#fff1dc', '#2b2d42'],
      ['#4cc9f0', '#2a97bd', '#e1f7ff', '#2b2d42'],
    ],
    draw: (c) =>
      `<circle cx="26" cy="32" r="10" fill="${c.fur}"/><circle cx="74" cy="32" r="10" fill="${c.fur}"/><circle cx="26" cy="32" r="5" fill="${c.light}"/><circle cx="74" cy="32" r="5" fill="${c.light}"/><circle cx="50" cy="54" r="29" fill="${c.fur}"/><g stroke="${c.accent}" stroke-width="3.4" stroke-linecap="round"><path d="M50 27v10M40 29l2 8M60 29l-2 8M23 50h8M23 58l7 1M77 50h-8M77 58l-7 1"/></g><ellipse cx="50" cy="65" rx="14" ry="10" fill="${c.light}"/>${eyes(50, 12)}${nose(c.accent, 59)}${smile(70, 4)}`,
  },
  {
    name: 'robot',
    looks: [
      ['#90e0ef', '#0096c7', '#caf0f8', '#ffb703'],
      ['#b5e48c', '#52b788', '#d8f3dc', '#ff7b54'],
    ],
    draw: (c) =>
      `<path d="M50 20v12" stroke="${c.dark}" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="17" r="5" fill="${c.accent}"/><rect x="20" y="32" width="60" height="50" rx="14" fill="${c.fur}"/><rect x="12" y="48" width="8" height="18" rx="4" fill="${c.dark}"/><rect x="80" y="48" width="8" height="18" rx="4" fill="${c.dark}"/><rect x="29" y="42" width="42" height="22" rx="8" fill="${c.light}"/><circle cx="40" cy="53" r="5" fill="${INK}"/><circle cx="60" cy="53" r="5" fill="${INK}"/><circle cx="41.5" cy="51.5" r="1.6" fill="#fff"/><circle cx="61.5" cy="51.5" r="1.6" fill="#fff"/><rect x="38" y="70" width="24" height="6" rx="3" fill="${c.dark}"/>`,
  },
  {
    name: 'alien',
    looks: [
      ['#9ae66e', '#4c9a2a', '#cfe8a8', '#2b2d42'],
      ['#8ecae6', '#3a86b0', '#d4edf7', '#2b2d42'],
    ],
    draw: (c) =>
      `<path d="M50 14q-32 4-32 40q0 22 32 32q32-10 32-32q0-36-32-40z" fill="${c.fur}"/><path d="M26 50q10 4 16 16q-14 0-16-16z" fill="#2b2d42"/><path d="M74 50q-10 4-16 16q14 0 16-16z" fill="#2b2d42"/><circle cx="33" cy="56" r="2" fill="#fff" opacity=".8"/><circle cx="67" cy="56" r="2" fill="#fff" opacity=".8"/>${smile(76, 5)}`,
  },
  {
    name: 'ghost',
    looks: [
      ['#9d8df1', '#6d5acf', '#ffffff', '#ff8fa3'],
      ['#ffadad', '#e07070', '#fffafa', '#ff8fa3'],
    ],
    draw: (c) =>
      `<path d="M24 82V48q0-30 26-30t26 30v34l-8.7-7-8.6 7-8.7-7-8.6 7-8.7-7z" fill="${c.light}"/>${eyes(48, 11, 4)}<ellipse cx="50" cy="62" rx="4.4" ry="5.6" fill="${INK}"/>${blush(58, 20)}`,
  },
  {
    name: 'astronaut',
    looks: [
      ['#3a0ca3', '#7b8cde', '#ffffff', '#ffd166'],
      ['#073b4c', '#06d6a0', '#f8fbff', '#ffd166'],
    ],
    draw: (c) =>
      `<circle cx="50" cy="52" r="32" fill="${c.light}"/><circle cx="50" cy="52" r="32" fill="none" stroke="${c.dark}" stroke-width="3"/><rect x="26" y="36" width="48" height="32" rx="16" fill="${INK}"/><path d="M34 44q8-6 16-4" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".7"/><circle cx="44" cy="54" r="3" fill="${c.accent}"/><circle cx="56" cy="54" r="3" fill="${c.accent}"/><rect x="42" y="84" width="16" height="6" rx="3" fill="${c.dark}"/>`,
  },
  {
    name: 'dino',
    looks: [
      ['#52b788', '#2d6a4f', '#d8f3dc', '#ef476f'],
      ['#ff9f1c', '#c46d00', '#ffe8c2', '#2b2d42'],
    ],
    draw: (c) =>
      `<path d="M30 34l5-14 6 12 7-15 6 14 7-12 5 14z" fill="${c.dark}"/><ellipse cx="50" cy="58" rx="30" ry="27" fill="${c.fur}"/><ellipse cx="50" cy="68" rx="19" ry="13" fill="${c.light}"/><circle cx="43" cy="66" r="1.8" fill="${c.dark}"/><circle cx="57" cy="66" r="1.8" fill="${c.dark}"/>${eyes(50, 14)}${smile(74, 5)}<circle cx="30" cy="58" r="3" fill="${c.dark}" opacity=".35"/><circle cx="70" cy="58" r="3" fill="${c.dark}" opacity=".35"/>`,
  },
  {
    name: 'fish',
    looks: [
      ['#4cc9f0', '#f77f00', '#ffd6a5', '#2b2d42'],
      ['#ffb4a2', '#6d6875', '#ffe5d9', '#2b2d42'],
    ],
    draw: (c) =>
      `<path d="M76 52L94 36v32z" fill="${c.dark}"/><ellipse cx="50" cy="52" rx="30" ry="24" fill="${c.fur}"/><path d="M46 30q4-10 14-8q0 8-6 12z M46 74q4 10 14 8q0-8-6-12z" fill="${c.dark}"/><path d="M62 38q8 14 0 28" fill="none" stroke="${c.light}" stroke-width="3" stroke-linecap="round" opacity=".7"/>${eye(34, 46, 4.4)}<path d="M24 58q5 5 10 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  },
  {
    name: 'chick',
    looks: [
      ['#ffe066', '#f9c74f', '#fff3b0', '#ff9f1c'],
      ['#ffd6e0', '#f4a6b8', '#fff0f4', '#ff9f1c'],
    ],
    draw: (c) =>
      `<path d="M50 14q-4 8 0 12q4-6 0-12M44 18q-6 6-2 10q6-4 2-10M56 18q6 6 2 10q-6-4-2-10" fill="${c.dark}"/><circle cx="50" cy="56" r="32" fill="${c.fur}"/><circle cx="30" cy="60" r="9" fill="${c.dark}" opacity=".55"/><circle cx="70" cy="60" r="9" fill="${c.dark}" opacity=".55"/>${eyes(50, 13)}<path d="M43 58h14l-7 9z" fill="${c.accent}"/>`,
  },
  {
    name: 'elephant',
    looks: [
      ['#a8b5c9', '#7a8aa3', '#e6ebf2', '#f4a6b8'],
      ['#e3c9a7', '#b89870', '#f6ebdc', '#f4a6b8'],
    ],
    draw: (c) =>
      `<circle cx="22" cy="46" r="18" fill="${c.dark}"/><circle cx="78" cy="46" r="18" fill="${c.dark}"/><circle cx="22" cy="46" r="10" fill="${c.accent}" opacity=".6"/><circle cx="78" cy="46" r="10" fill="${c.accent}" opacity=".6"/><circle cx="50" cy="50" r="27" fill="${c.fur}"/>${eyes(46, 13)}<path d="M42 56q-2 18 8 24q8 2 8-8" fill="none" stroke="${c.fur}" stroke-width="13" stroke-linecap="round"/><path d="M42 56q-2 18 8 24q8 2 8-8" fill="none" stroke="${c.dark}" stroke-width="1.6" stroke-linecap="round" opacity=".4"/>`,
  },
  {
    name: 'unicorn',
    looks: [
      ['#e0aaff', '#9d4edd', '#ffffff', '#ffd166'],
      ['#bde0fe', '#4895ef', '#ffffff', '#ffd166'],
    ],
    draw: (c) =>
      `<path d="M50 4l6 24H44z" fill="${c.accent}"/><path d="M24 40q-12 10-6 30q10-4 14-14z M76 40q12 10 6 30q-10-4-14-14z" fill="${c.dark}"/><path d="M30 36L26 20l14 8z M70 36l4-16-14 8z" fill="${c.light}"/><circle cx="50" cy="56" r="27" fill="${c.light}"/><path d="M40 30q10-4 20 0q-6 8-10 8t-10-8z" fill="${c.dark}"/><ellipse cx="50" cy="68" rx="13" ry="9" fill="#ffe5ec"/>${eyes(54, 12)}${blush(62, 22)}<circle cx="46" cy="68" r="1.4" fill="${c.dark}"/><circle cx="54" cy="68" r="1.4" fill="${c.dark}"/>`,
  },
  {
    name: 'moon',
    looks: [
      ['#ffd166', '#c99a2e', '#fff3bf', '#ff8fa3'],
      ['#f4f1de', '#b8b39a', '#ffffff', '#ff8fa3'],
    ],
    draw: (c) =>
      `<path d="M48.7 20A32 32 0 1 0 75.5 68.3A28 28 0 0 1 48.7 20z" fill="${c.fur}"/><circle cx="34" cy="56" r="3.2" fill="${INK}"/><path d="M26 66q7 6 14 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><circle cx="26" cy="62" r="4" fill="${c.accent}" opacity=".5"/><circle cx="74" cy="22" r="2.6" fill="${c.light}"/><circle cx="84" cy="44" r="1.8" fill="${c.light}"/><circle cx="76" cy="68" r="2.2" fill="${c.light}"/>`,
  },
  {
    name: 'sun',
    looks: [
      ['#fff1c9', '#ffb703', '#ffd166', '#ef476f'],
      ['#ffe0d6', '#ff6b6b', '#ffa69e', '#7b2d26'],
    ],
    draw: (c) =>
      `<g stroke="${c.fur}" stroke-width="5" stroke-linecap="round"><path d="M50 8v10M50 82v10M8 50h10M82 50h10M20 20l7 7M73 73l7 7M80 20l-7 7M27 73l-7 7"/></g><circle cx="50" cy="50" r="24" fill="${c.fur}"/>${eyes(47, 9)}${smile(57, 6)}${blush(56, 15)}`,
  },
];

export interface Avatar {
  id: string;
  svg: string;
}

// Pictures are shown as circles, so the character is drawn a little smaller to keep ears,
// horns and rays inside the crop.
const tile = (bg: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${bg}"/><g transform="translate(7 8) scale(.86)">${body}</g></svg>`;

// Soft backgrounds, cycled so neighbours differ.
const BACKGROUNDS = [
  '#ffe5d9',
  '#d8e2dc',
  '#cdeac0',
  '#cfe8ff',
  '#e8d5ff',
  '#fff1b8',
  '#ffd6e0',
  '#c7f2e8',
  '#ffdfba',
  '#d6dcff',
  '#f1e4d0',
  '#d0f0f7',
];

export const AVATARS: Avatar[] = CRITTERS.flatMap((critter, i) =>
  critter.looks.map(([fur, dark, light, accent], variant) => {
    const n = i * 2 + variant;
    // The night-sky characters keep their own dark tile.
    const bg =
      critter.name === 'moon' || critter.name === 'astronaut'
        ? dark2bg(critter, variant)
        : BACKGROUNDS[(n * 5 + variant * 3) % BACKGROUNDS.length]!;
    return {
      id: `av-${String(n + 1).padStart(2, '0')}`,
      svg: tile(bg, critter.draw({ bg, fur, dark, light, accent })),
    };
  }),
);

function dark2bg(critter: (typeof CRITTERS)[number], variant: number) {
  return critter.name === 'moon'
    ? ['#22223b', '#3d405b'][variant]!
    : ['#3a0ca3', '#073b4c'][variant]!;
}

const byId = new Map(AVATARS.map((a) => [a.id, a]));

export const isAvatarId = (value: unknown): value is string =>
  typeof value === 'string' && /^av-\d{2}$/.test(value);

const LEVELS = [0x00, 0x55, 0xaa, 0xff] as const;
const gray = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  // Four clear gray levels: e-ink panels render in-between values muddy.
  const level = LEVELS[lum < 64 ? 0 : lum < 130 ? 1 : lum < 205 ? 2 : 3]!;
  return `#${level.toString(16).padStart(2, '0').repeat(3)}`;
};

/**
 * The same picture for an e-ink screen: pure black, white and two grays, a white tile, and a
 * black outline around every filled shape so light colors (a yellow chick) keep their shape.
 */
export const einkSvg = (svg: string): string => {
  const tinted = svg
    .replace(
      /<rect width="100" height="100" fill="#[0-9a-f]{6}"\/>/i,
      '<rect width="100" height="100" fill="#fff"/>',
    )
    .replace(/#[0-9a-f]{6}/gi, (hex) => gray(hex));
  return tinted.replace(
    /<(circle|ellipse|path|rect)\b([^>]*?)(\/?)>/g,
    (match, tag, attrs, close) => {
      if (/fill="none"|stroke=|opacity=|width="100" height="100"/.test(attrs)) return match;
      // Black features and tiny highlights (an eye's glint) stay as they are.
      if (/fill="#000000"/.test(attrs)) return match;
      const radius = /\br="([\d.]+)"/.exec(attrs);
      if (radius && Number(radius[1]) < 3) return match;
      return `<${tag}${attrs} stroke="#000" stroke-width="2" stroke-linejoin="round"${close}>`;
    },
  );
};

/** A picture as a data URI for an <img>, or null for an unknown id. */
export const avatarSrc = (
  id: string | null | undefined,
  { eink = false }: { eink?: boolean } = {},
): string | null => {
  const avatar = id ? byId.get(id) : undefined;
  if (!avatar) return null;
  return `data:image/svg+xml;utf8,${encodeURIComponent(eink ? einkSvg(avatar.svg) : avatar.svg)}`;
};
