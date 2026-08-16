import constants from "../config/constants.js";

// Rough estimate — no tokenizer dependency yet. ~4 characters per token
// is a reasonable approximation for English text.
function estimateTokens(text) {
   return Math.ceil(text.length / 4);
}

// Splits on sentence boundaries — used as the fallback when a single
// paragraph is itself bigger than the target child size.
function splitBySentences(text) {
   return text.split(/(?<=[.!?])\s+/).filter(Boolean);
}

function splitParagraphBySentences(paragraph, targetTokens) {
   const sentences = splitBySentences(paragraph);
   const pieces = [];
   let current = '';

   for (const sentence of sentences) {
      const candidate = current ? `${current} ${sentence}` : sentence;

      if (current && estimateTokens(candidate) > targetTokens) {
         pieces.push(current);
         current = sentence;
      } else {
         current = candidate;
      }
   }
   if (current) pieces.push(current);

   return pieces;
}

// Grabs roughly the last N tokens' worth of characters from a chunk, to
// prepend to the next chunk so context isn't lost right at the boundary.
function takeLastTokens(text, tokenCount) {
   const charCount = tokenCount * 4;
   return text.length > charCount ? text.slice(-charCount) : text;
}

function splitParentIntoChildren(parent) {
   const { MAX_CHILD_CHUNK_TOKENS, TARGET_CHILD_CHUNK_TOKENS, OVERLAP_TOKENS } = constants.chunk;

   // Step 5a: split on paragraph boundaries first (don't cut a paragraph/table
   // mid-way); fall back to sentence-level splitting only for paragraphs that
   // are themselves too large on their own.
   const paragraphs = parent.text.split('\n\n').filter(Boolean);
   const pieces = [];
   for (const paragraph of paragraphs) {
      if (estimateTokens(paragraph) > MAX_CHILD_CHUNK_TOKENS) {
         pieces.push(...splitParagraphBySentences(paragraph, TARGET_CHILD_CHUNK_TOKENS));
      } else {
         pieces.push(paragraph);
      }
   }

   // Step 5b: greedily group pieces up to the target size, carrying a small
   // overlap from the tail of one child into the start of the next.
   const childTexts = [];
   let current = '';
   for (const piece of pieces) {
      const candidate = current ? `${current}\n\n${piece}` : piece;

      if (current && estimateTokens(candidate) > TARGET_CHILD_CHUNK_TOKENS) {
         childTexts.push(current);
         const overlap = takeLastTokens(current, OVERLAP_TOKENS);
         current = overlap ? `${overlap}\n\n${piece}` : piece;
      } else {
         current = candidate;
      }
   }
   if (current) childTexts.push(current);

   // Note: every child from this parent shares the parent's start_page/end_page —
   // per-paragraph page tracking was lost when handleChunking joined the section's
   // items into one string. Good enough for citations at section granularity for now.
   return childTexts.map((text, index) => ({
      chunk_id: `${parent.parent_id}-child-${index}`,
      parent_id: parent.parent_id,
      section_title: parent.section_title,
      text,
      start_page: parent.start_page,
      end_page: parent.end_page
   }));
}

function buildChildChunks({ parentChunks }) {
   const childChunks = [];

   for (const parent of parentChunks) {
      const estimatedTokens = estimateTokens(parent.text);

      if (estimatedTokens <= constants.chunk.MAX_CHILD_CHUNK_TOKENS) {
         // small enough — the parent chunk IS the child chunk
         childChunks.push({
            chunk_id: `${parent.parent_id}-child-0`,
            parent_id: parent.parent_id,
            section_title: parent.section_title,
            text: parent.text,
            start_page: parent.start_page,
            end_page: parent.end_page
         });
      } else {
         childChunks.push(...splitParentIntoChildren(parent));
      }
   }

   return childChunks;
}

function handleChunking({ flatItems }) {
   const parentChunksMap = new Map();

   for (const item of flatItems) {
      const { section_index, section_title, page_number } = item;

      if (!parentChunksMap.has(section_index)) {
         parentChunksMap.set(section_index, {
            parent_id: `section-${section_index}`,
            section_title,
            text: [],
            start_page: page_number,
            end_page: page_number
         });
      }

      const parentChunk = parentChunksMap.get(section_index);

      // skip the heading that started this section — section_title already covers it
      const isSectionHeading = item.type === 'heading' && item.level <= 2;
      if (!isSectionHeading) {
         parentChunk.text.push(item.value ?? item.md);
      }

      parentChunk.start_page = Math.min(parentChunk.start_page, page_number);
      parentChunk.end_page = Math.max(parentChunk.end_page, page_number);
   }

   return Array.from(parentChunksMap.values()).map(chunk => ({
      ...chunk,
      text: chunk.text.join('\n\n')
   }));
}

function handlePdfData({ data }) {
   const flatItems = [];

   let currentSectionIndex = -1;
   let currentSectionTitle = null;

   for (const page of data.pages) {
      for (const item of page.items) {
         // page furniture, not content — skip it
         if (item.type === 'footer' || item.type === 'header') {
            continue;
         }

         // only level 1-2 headings start a new section; level 3+ stays in the current one
         if (item.type === 'heading' && item.level <= 2) {
            currentSectionIndex += 1;
            currentSectionTitle = item.value;
         }

         flatItems.push({
            ...item,
            page_number: page.page_number,
            section_index: currentSectionIndex,
            section_title: currentSectionTitle
         })
      }
   }

   return flatItems;
}

export default {
   handleChunking,
   handlePdfData,
   buildChildChunks
}
