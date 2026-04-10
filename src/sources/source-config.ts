import type { SourceFeed } from '../types.js';

/**
 * RSS Bridge base URL — run `docker compose up -d` to start it locally.
 * Used to convert Facebook pages into RSS feeds.
 */
const RSS_BRIDGE = process.env.RSS_BRIDGE_URL || 'http://localhost:3001';

/** Helper: build RSS Bridge URL for a Facebook page */
function fbPageFeed(username: string): string {
  return `${RSS_BRIDGE}/?action=display&bridge=Facebook&context=User&u=${username}&media_type=all&format=Atom`;
}

/**
 * Foreign travel blog RSS feeds + Facebook pages to monitor.
 * Mix of English and German sources covering destinations relevant to Polish travelers.
 *
 * To add a Facebook page:
 *   { name: 'Page Name', url: fbPageFeed('page-username'), language: 'en' }
 *
 * Find the username in the FB page URL: facebook.com/NomadNumbers → 'NomadNumbers'
 */
export const SOURCE_FEEDS: SourceFeed[] = [
  // --- English blogs ---
  {
    name: 'Lonely Planet',
    url: 'https://www.lonelyplanet.com/news/feed',
    language: 'en',
  },
  {
    name: 'Nomadic Matt',
    url: 'https://www.nomadicmatt.com/travel-blog/feed/',
    language: 'en',
  },
  {
    name: 'The Points Guy',
    url: 'https://thepointsguy.com/feed/',
    language: 'en',
  },
  {
    name: 'CN Traveler',
    url: 'https://www.cntraveler.com/feed/rss',
    language: 'en',
  },
  {
    name: 'Travel + Leisure',
    url: 'https://www.travelandleisure.com/arcio/rss/',
    language: 'en',
  },
  {
    name: 'Budget Travel',
    url: 'https://www.budgettravel.com/feed',
    language: 'en',
  },
  {
    name: 'Expert Vagabond',
    url: 'https://expertvagabond.com/feed/',
    language: 'en',
  },
  {
    name: 'Adventurous Kate',
    url: 'https://www.adventurouskate.com/feed/',
    language: 'en',
  },
  // --- German blogs ---
  {
    name: 'Travelbook DE',
    url: 'https://www.travelbook.de/feed',
    language: 'de',
  },
  {
    name: 'Urlaubsguru',
    url: 'https://www.urlaubsguru.de/feed/',
    language: 'de',
  },
  // --- Facebook pages (via RSS Bridge) ---
  // Duże strony podróżnicze (miliony obserwujących)
  { name: 'Beautiful Destinations FB', url: fbPageFeed('BeautifulDestinations'), language: 'en' },
  { name: 'NatGeo Travel FB', url: fbPageFeed('natgeotravel'), language: 'en' },
  { name: 'Lonely Planet FB', url: fbPageFeed('lonelyplanet'), language: 'en' },
  { name: 'Condé Nast Traveler FB', url: fbPageFeed('CondeNastTraveler'), language: 'en' },
  { name: 'Travel + Leisure FB', url: fbPageFeed('travelandleisure'), language: 'en' },
  { name: 'Rough Guides FB', url: fbPageFeed('roughguides'), language: 'en' },
  { name: 'Matador Network FB', url: fbPageFeed('matabornetwork'), language: 'en' },
  // Blogerzy podróżniczy
  { name: 'Nomadic Matt FB', url: fbPageFeed('nomadicmatt'), language: 'en' },
  { name: 'Adventurous Kate FB', url: fbPageFeed('adventurouskate'), language: 'en' },
  { name: 'The Planet D FB', url: fbPageFeed('ThePlanetD'), language: 'en' },
  { name: 'The Blonde Abroad FB', url: fbPageFeed('theblondeabroad'), language: 'en' },
  { name: 'Expert Vagabond FB', url: fbPageFeed('expertvagabond'), language: 'en' },
  // Budżetowe / backpacking
  { name: 'Budget Travel FB', url: fbPageFeed('BudgetTravel'), language: 'en' },
  { name: 'Backpacker Banter FB', url: fbPageFeed('backpackerbanter'), language: 'en' },
  // Niemieckie
  { name: 'Urlaubspiraten FB', url: fbPageFeed('Urlaubspiraten'), language: 'de' },
  { name: 'Travelbook DE FB', url: fbPageFeed('TravelbookDE'), language: 'de' },
];

/** Max articles to fetch per feed */
export const MAX_ITEMS_PER_FEED = 10;

/** Max age of source articles in hours */
export const MAX_ARTICLE_AGE_HOURS = 72;

/** How many source-based articles to produce */
export const SOURCE_ARTICLE_COUNT = 5;
