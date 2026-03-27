import { fetchTrends } from '../trends/trend-fetcher.js';

const categories = [
  { name: 'Tajlandia', keywords: ['tajlandia', 'bangkok', 'phi phi', 'krabi', 'phuket', 'chiang mai', 'koh samui'] },
  { name: 'Bali', keywords: ['bali', 'ubud', 'seminyak', 'nusa penida', 'kuta', 'uluwatu', 'canggu'] },
];

async function main() {
  console.time('fetch');
  const data = await fetchTrends(categories);
  console.timeEnd('fetch');

  console.log('\n=== DAILY TRENDS (PL) ===');
  data.dailyTrends.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));

  console.log('\n=== RELATED QUERIES ===');
  for (const [cat, queries] of Object.entries(data.relatedQueries)) {
    console.log(`\n[${cat}]`);
    if (queries.length === 0) console.log('  (brak)');
    else queries.slice(0, 15).forEach((q, i) => console.log(`  ${i + 1}. ${q}`));
  }

  console.log('\n=== PYTANIA LUDZI (Google Suggest) ===');
  for (const [cat, questions] of Object.entries(data.peopleQuestions)) {
    console.log(`\n[${cat}] (${questions.length} pytań)`);
    questions.slice(0, 30).forEach((q, i) => console.log(`  ${i + 1}. ${q}`));
  }
}

main();
