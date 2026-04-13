import type { Topic } from '../types.js';

/**
 * Polish destination/country → English Unsplash-friendly token.
 * Unsplash tags are English, so Polish queries match nothing.
 */
const DESTINATION_MAP: Record<string, string> = {
  // Azja
  Tajlandia: 'Thailand',
  Bali: 'Bali Indonesia',
  Wietnam: 'Vietnam',
  Japonia: 'Japan',
  Indonezja: 'Indonesia',
  Filipiny: 'Philippines',
  Malezja: 'Malaysia',
  Kambodża: 'Cambodia',
  'Sri Lanka': 'Sri Lanka',
  Indie: 'India',
  Chiny: 'China',
  Singapur: 'Singapore',
  // Europa
  Grecja: 'Greece',
  Włochy: 'Italy',
  Hiszpania: 'Spain',
  Portugalia: 'Portugal',
  Chorwacja: 'Croatia',
  Turcja: 'Turkey',
  Albania: 'Albania',
  Francja: 'France',
  Niemcy: 'Germany',
  Czarnogóra: 'Montenegro',
  Malta: 'Malta',
  Cypr: 'Cyprus',
  Słowenia: 'Slovenia',
  Węgry: 'Hungary',
  Czechy: 'Czech Republic',
  Austria: 'Austria',
  Bułgaria: 'Bulgaria',
  Rumunia: 'Romania',
  Islandia: 'Iceland',
  Norwegia: 'Norway',
  Irlandia: 'Ireland',
  Szkocja: 'Scotland',
  Anglia: 'England',
  Holandia: 'Netherlands',
  Szwajcaria: 'Switzerland',
  // Ameryka
  USA: 'USA',
  Kanada: 'Canada',
  Meksyk: 'Mexico',
  // Afryka / Bliski Wschód
  Egipt: 'Egypt',
  Maroko: 'Morocco',
  Tunezja: 'Tunisia',
  RPA: 'South Africa',
  Dubaj: 'Dubai',
  ZEA: 'UAE Dubai',
};

/** Visual themes appended to a destination to vary the images. */
const DESTINATION_THEMES = [
  'landscape',
  'old town',
  'beach',
  'architecture',
  'street',
  'coastline',
];

/** Generic travel-topic themes (flights, visas, insurance, refunds). */
const GENERIC_THEMES = [
  'airport',
  'airplane window',
  'passport travel',
  'luggage airport',
  'boarding pass',
  'flight cabin',
];

/** Find an English destination token for a Polish category or title. */
function resolveDestination(topic: Topic): string | null {
  const categoryMatch = DESTINATION_MAP[topic.category];
  if (categoryMatch) return categoryMatch;

  for (const [pl, en] of Object.entries(DESTINATION_MAP)) {
    if (topic.title.includes(pl)) return en;
  }
  return null;
}

/**
 * Build short, keyword-style English queries for Unsplash based on a topic.
 * Returns exactly `count` queries. Index 0 is the hero image.
 */
export function buildImageQueries(topic: Topic, count: number): string[] {
  const destination = resolveDestination(topic);
  const themes = destination ? DESTINATION_THEMES : GENERIC_THEMES;

  const queries: string[] = [];
  for (let i = 0; i < count; i++) {
    const theme = themes[i % themes.length];
    queries.push(destination ? `${destination} ${theme}` : theme);
  }
  return queries;
}
