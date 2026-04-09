const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'pl-PL,pl;q=0.9',
};

/** Known travel destinations to scan for trending interest */
const DESTINATION_POOL = [
  // Azja
  { name: 'Tajlandia', keywords: ['tajlandia', 'bangkok', 'phuket', 'krabi', 'chiang mai', 'koh samui', 'phi phi'] },
  { name: 'Bali', keywords: ['bali', 'ubud', 'seminyak', 'nusa penida', 'kuta', 'uluwatu', 'canggu'] },
  { name: 'Wietnam', keywords: ['wietnam', 'hanoi', 'ho chi minh', 'ha long bay', 'da nang', 'hoi an', 'sapa'] },
  { name: 'Kambodża', keywords: ['kambodża', 'siem reap', 'angkor wat', 'phnom penh', 'kampot', 'koh rong'] },
  { name: 'Japonia', keywords: ['japonia', 'tokio', 'kioto', 'osaka', 'hiroszima', 'nara'] },
  { name: 'Chiny', keywords: ['chiny', 'pekin', 'szanghaj', 'hongkong', 'guilin', 'wielki mur'] },
  { name: 'Sri Lanka', keywords: ['sri lanka', 'kolombo', 'ella', 'sigirija', 'kandy', 'mirissa'] },
  { name: 'Filipiny', keywords: ['filipiny', 'manila', 'palawan', 'el nido', 'boracay', 'cebu', 'siargao'] },
  { name: 'Malezja', keywords: ['malezja', 'kuala lumpur', 'langkawi', 'penang', 'borneo', 'malakka'] },
  { name: 'Nepal', keywords: ['nepal', 'katmandu', 'pokhara', 'everest', 'annapurna', 'chitwan'] },
  { name: 'Indie', keywords: ['indie', 'goa', 'delhi', 'rajasthan', 'kerala', 'mumbaj', 'agra'] },
  { name: 'Korea Południowa', keywords: ['korea', 'seul', 'busan', 'jeju', 'korea południowa'] },
  { name: 'Singapur', keywords: ['singapur', 'marina bay', 'sentosa', 'gardens by the bay'] },
  { name: 'Indonezja', keywords: ['indonezja', 'jawa', 'lombok', 'komodo', 'flores', 'raja ampat'] },
  { name: 'Birma', keywords: ['birma', 'myanmar', 'rangun', 'bagan', 'mandalay', 'jezioro inle'] },
  { name: 'Laos', keywords: ['laos', 'luang prabang', 'vientiane', 'vang vieng'] },
  // Europa — trendujące destynacje
  { name: 'Grecja', keywords: ['grecja', 'ateny', 'santorini', 'kreta', 'rodos', 'korfu', 'zakynthos', 'mykonos'] },
  { name: 'Włochy', keywords: ['włochy', 'rzym', 'mediolan', 'wenecja', 'florencja', 'neapol', 'sycylia', 'sardynia'] },
  { name: 'Hiszpania', keywords: ['hiszpania', 'barcelona', 'madryt', 'majorka', 'teneryfa', 'malaga', 'ibiza'] },
  { name: 'Portugalia', keywords: ['portugalia', 'lizbona', 'porto', 'algarve', 'madera', 'azory'] },
  { name: 'Chorwacja', keywords: ['chorwacja', 'dubrownik', 'split', 'hvar', 'zadar', 'plitwice'] },
  { name: 'Turcja', keywords: ['turcja', 'stambuł', 'antalya', 'kapadocja', 'bodrum', 'fethiye', 'pamukkale'] },
  { name: 'Czarnogóra', keywords: ['czarnogóra', 'kotor', 'budva', 'tivat', 'durmitor'] },
  { name: 'Albania', keywords: ['albania', 'tirana', 'saranda', 'ksamil', 'berat', 'vlora', 'durres'] },
  { name: 'Malta', keywords: ['malta', 'valletta', 'gozo', 'comino', 'blue lagoon malta'] },
  { name: 'Islandia', keywords: ['islandia', 'reykjavik', 'blue lagoon', 'golden circle', 'zorza polarna islandia'] },
  { name: 'Cypr', keywords: ['cypr', 'pafos', 'larnaka', 'limassol', 'ayia napa', 'nikozja'] },
  { name: 'Gruzja', keywords: ['gruzja', 'tbilisi', 'batumi', 'kazbegi', 'kutaisi', 'swanetia'] },
];

export interface DiscoveredCategory {
  name: string;
  keywords: string[];
  trendScore: number;
}

/** Travel-related keywords that indicate real travel interest in suggestions */
const TRAVEL_SIGNALS = [
  'wakacje', 'wczasy', 'urlop', 'lot', 'loty', 'bilet', 'hotel', 'hostel', 'noclegi',
  'all inclusive', 'last minute', 'cena', 'koszt', 'budżet', 'ile kosztuje',
  'wiza', 'paszport', 'ubezpieczenie', 'szczepienia', 'bezpiecznie', 'pogoda',
  'kiedy jechać', 'kiedy lecieć', 'co zobaczyć', 'co zwiedzić', 'atrakcje',
  'plaża', 'jedzenie', 'restauracje', 'transport', 'dojazd', 'wycieczka',
  'przewodnik', 'mapa', 'itinerarium', 'trasa', 'plan',
];

/**
 * Discover which destinations are trending right now.
 * Scores by relevance of Google Suggest results (travel-related keywords),
 * not just count. Also rotates daily to ensure variety.
 */
export async function discoverTrendingCategories(maxCategories: number = 6): Promise<DiscoveredCategory[]> {
  const scored: DiscoveredCategory[] = [];

  for (const dest of DESTINATION_POOL) {
    const queries = [
      `${dest.keywords[0]} wakacje`,
      `${dest.keywords[0]} loty`,
      `${dest.keywords[0]} ${new Date().getFullYear()}`,
      `${dest.keywords[0]} co zobaczyć`,
    ];

    let relevanceScore = 0;
    for (const q of queries) {
      const suggestions = await fetchSuggestions(q);
      for (const s of suggestions) {
        const lower = s.toLowerCase();
        // Each travel-related suggestion adds points
        for (const signal of TRAVEL_SIGNALS) {
          if (lower.includes(signal)) {
            relevanceScore += 2;
            break; // count each suggestion once
          }
        }
        // Bonus for suggestions containing the destination name + year
        if (lower.includes(String(new Date().getFullYear()))) {
          relevanceScore += 1;
        }
      }
    }

    scored.push({
      name: dest.name,
      keywords: dest.keywords,
      trendScore: relevanceScore,
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Sort by relevance score
  scored.sort((a, b) => b.trendScore - a.trendScore);

  // Daily rotation: shift the pool based on day-of-year so different
  // destinations with similar scores get a chance on different days
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const rotationOffset = dayOfYear % Math.max(1, Math.floor(scored.length / maxCategories));

  // Take top candidates (2x what we need), then rotate within them
  const candidatePool = scored.slice(0, maxCategories * 3);
  const rotated = [
    ...candidatePool.slice(rotationOffset),
    ...candidatePool.slice(0, rotationOffset),
  ];

  // Pick top N from rotated pool, ensuring mix of Asia + Europe
  const selected: DiscoveredCategory[] = [];
  const asiaNames = new Set(DESTINATION_POOL.slice(0, 16).map((d) => d.name));
  let asiaCount = 0;
  let europeCount = 0;
  const maxPerRegion = Math.ceil(maxCategories * 0.65); // max ~65% from one region

  for (const cat of rotated) {
    if (selected.length >= maxCategories) break;
    const isAsia = asiaNames.has(cat.name);
    if (isAsia && asiaCount >= maxPerRegion) continue;
    if (!isAsia && europeCount >= maxPerRegion) continue;
    selected.push(cat);
    if (isAsia) asiaCount++; else europeCount++;
  }

  // Fill remaining if region caps left gaps
  for (const cat of rotated) {
    if (selected.length >= maxCategories) break;
    if (!selected.includes(cat)) selected.push(cat);
  }

  console.log('Trending destinations:');
  selected.forEach((d) => console.log(`  ${d.name}: score ${d.trendScore}`));

  return selected;
}

async function fetchSuggestions(query: string): Promise<string[]> {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=pl&gl=pl&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) return [];
    const buffer = await response.arrayBuffer();
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    const data = JSON.parse(text);
    return data[1] ?? [];
  } catch {
    return [];
  }
}
