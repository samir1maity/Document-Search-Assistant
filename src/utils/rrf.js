const DEFAULT_K = 60;

// merges ranked lists into one via Reciprocal Rank Fusion — works even
// though the lists' scores (cosine similarity, keyword match) aren't comparable
function mergeWithRRF(lists, { k = DEFAULT_K, getKey }) {
   const scoreByKey = new Map();
   const itemByKey = new Map();

   for (const list of lists) {
      list.forEach((item, index) => {
         const key = getKey(item);
         const rank = index + 1;

         scoreByKey.set(key, (scoreByKey.get(key) ?? 0) + 1 / (k + rank));
         itemByKey.set(key, itemByKey.get(key) ?? item);
      });
   }

   return Array.from(scoreByKey, ([key, rrfScore]) => ({ ...itemByKey.get(key), rrf_score: rrfScore }))
      .sort((a, b) => b.rrf_score - a.rrf_score);
}

export default mergeWithRRF;
