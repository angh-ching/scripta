import type { Block } from './contracts'

/**
 * A small synthetic note used by the sample-scan button and the mock OCR
 * stream. Coordinates match the canvas rendered in the browser.
 */
export const SAMPLE_NOTE_BLOCKS: Omit<Block, 'id'>[] = [
  {
    type: 'heading',
    text: 'Field Notes — North Jetty',
    bbox: [53, 75, 109, 833],
    confidence: 0.97,
  },
  {
    type: 'paragraph',
    text: 'The tide came in earlier than the almanac predicted. I marked the high-water line with a blue peg near the north jetty.',
    bbox: [144, 75, 244, 875],
    confidence: 0.89,
  },
  {
    type: 'paragraph',
    text: 'Wind: SW, 12 knots. Visibility: good. Two oystercatchers on the rocks.',
    bbox: [269, 75, 350, 875],
    confidence: 0.64,
  },
  {
    type: 'list',
    text: 'Check salinity at 06:40\nPhotograph erosion markers\nAsk Mara about the 1998 survey',
    bbox: [387, 78, 531, 875],
    confidence: 0.91,
  },
  {
    type: 'equation',
    text: 'h(t) = 2.4 + 0.8\\sin(\\theta)',
    bbox: [575, 267, 631, 667],
    confidence: 0.86,
  },
  {
    type: 'table',
    text: '| Time | Height |\n| --- | --- |\n| 06:00 | 2.1 m |\n| 12:00 | 3.2 m |',
    bbox: [669, 92, 856, 833],
    confidence: 0.78,
  },
  {
    type: 'paragraph',
    text: 'Follow up: compare with the 2019 dataset and update the field log.',
    bbox: [894, 75, 963, 875],
    confidence: 0.58,
  },
]

export const SAMPLE_NOTE_TITLE = 'Field Notes — North Jetty'

export const SAMPLE_NOTE_TEXT = `Field Notes — North Jetty

The tide came in earlier than the almanac predicted. I marked the high-water line with a blue peg near the north jetty.

Wind: SW, 12 knots. Visibility: good. Two oystercatchers on the rocks.

Check salinity at 06:40
Photograph erosion markers
Ask Mara about the 1998 survey

h(t) = 2.4 + 0.8 sin(θ)

Time        Height
06:00       2.1 m
12:00       3.2 m

Follow up: compare with the 2019 dataset and update the field log.`

/** Demo translation lines for a few languages. Unknown targets fall back to English. */
export const SAMPLE_TRANSLATIONS: Record<string, string[]> = {
  es: [
    'Notas de campo — Espigón norte',
    'La marea subió antes de lo que predijo el almanaque. Marqué la línea de pleamar con una estaca azul cerca del espigón norte.',
    'Viento: SO, 12 nudos. Visibilidad: buena. Dos ostreros sobre las rocas.',
    'Comprobar la salinidad a las 06:40\nFotografiar los marcadores de erosión\nPreguntar a Mara por el estudio de 1998',
    'h(t) = 2,4 + 0,8\\sin(\\theta)',
    '| Hora | Altura |\n| --- | --- |\n| 06:00 | 2,1 m |\n| 12:00 | 3,2 m |',
    'Seguimiento: comparar con el conjunto de datos de 2019 y actualizar el registro de campo.',
  ],
  fr: [
    'Notes de terrain — Jetée nord',
    'La marée est montée plus tôt que prévu par l’almanach. J’ai marqué la laisse de haute mer avec un piquet bleu près de la jetée nord.',
    'Vent : SO, 12 nœuds. Visibilité : bonne. Deux huîtriers pie sur les rochers.',
    'Relever la salinité à 06 h 40\nPhotographier les repères d’érosion\nDemander à Mara des précisions sur l’étude de 1998',
    'h(t) = 2,4 + 0,8\\sin(\\theta)',
    '| Heure | Hauteur |\n| --- | --- |\n| 06:00 | 2,1 m |\n| 12:00 | 3,2 m |',
    'Suivi : comparer avec le jeu de données de 2019 et mettre à jour le carnet de terrain.',
  ],
  ja: [
    'フィールドノート — 北防波堤',
    '潮は暦の予想より早く満ちた。北防波堤近くの青い杭で満潮線を示した。',
    '風：南西12ノット。視界：良好。岩の上にミヤコドリが2羽。',
    '06:40に塩分を確認\n浸食マーカーを撮影\n1998年の調査についてマラに聞く',
    'h(t) = 2.4 + 0.8\\sin(\\theta)',
    '| 時刻 | 潮位 |\n| --- | --- |\n| 06:00 | 2.1 m |\n| 12:00 | 3.2 m |',
    'フォローアップ：2019年のデータセットと比較し、フィールドログを更新する。',
  ],
  hi: [
    'फ़ील्ड नोट्स — उत्तरी जेटी',
    'ज्वार पंचांग के अनुमान से पहले आ गया। उत्तरी जेटी के पास नीली खूँटी से उच्च-जल रेखा चिह्नित की।',
    'हवा: दक्षिण-पश्चिम, 12 नॉट। दृश्यता: अच्छी। चट्टानों पर दो ओइस्टरकैचर।',
    '06:40 पर लवणता जाँचें\nअपरदन मार्करों की तस्वीर लें\n1998 के सर्वेक्षण के बारे में मारा से पूछें',
    'h(t) = 2.4 + 0.8\\sin(\\theta)',
    '| समय | ऊँचाई |\n| --- | --- |\n| 06:00 | 2.1 मी |\n| 12:00 | 3.2 मी |',
    'अगला कदम: 2019 के डेटासेट से तुलना करें और फ़ील्ड लॉग अपडेट करें।',
  ],
  ta: [
    'களக் குறிப்புகள் — வடக்கு அலைதடுப்பு',
    'பஞ்சாங்கம் கணித்ததை விட அலை வேகமாக உயர்ந்தது. வடக்கு அலைதடுப்பு அருகே நீல ஆப்பால் உயர்நீர் கோட்டைக் குறித்தேன்.',
    'காற்று: தென்மேற்கு, 12 கடல் மைல். தெளிவு: நல்லது. பாறைகளில் இரண்டு கடல்காக்கைகள்.',
    '06:40 மணிக்கு உப்புத்தன்மையைச் சரிபார்க்கவும்\nஅரிப்புக் குறிகளைப் படமெடுக்கவும்\n1998 ஆய்வு குறித்து மாராவிடம் கேட்கவும்',
    'h(t) = 2.4 + 0.8\\sin(\\theta)',
    '| நேரம் | உயரம் |\n| --- | --- |\n| 06:00 | 2.1 மீ |\n| 12:00 | 3.2 மீ |',
    'தொடர்வு: 2019 தரவுத்தொகுப்புடன் ஒப்பிட்டு களப் பதிவைப் புதுப்பிக்கவும்.',
  ],
}
