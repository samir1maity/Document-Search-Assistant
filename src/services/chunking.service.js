import constants from "../config/constants.js";
import prismaClient from '../config/prisma.client.js'

// rough estimate: ~4 chars per token
function estimateTokens(text) {
   return Math.ceil(text.length / 4);
}

// fallback for paragraphs too big to keep whole
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

// tail of a chunk, used as overlap for the next one
function takeLastTokens(text, tokenCount) {
   const charCount = tokenCount * 4;
   return text.length > charCount ? text.slice(-charCount) : text;
}

function splitParentIntoChildren(parent) {
   const { MAX_CHILD_CHUNK_TOKENS, TARGET_CHILD_CHUNK_TOKENS, OVERLAP_TOKENS } = constants.chunk;

   // split by paragraph first, sentence-split only if a paragraph is too big
   const paragraphs = parent.text.split('\n\n').filter(Boolean);
   const pieces = [];
   for (const paragraph of paragraphs) {
      if (estimateTokens(paragraph) > MAX_CHILD_CHUNK_TOKENS) {
         pieces.push(...splitParagraphBySentences(paragraph, TARGET_CHILD_CHUNK_TOKENS));
      } else {
         pieces.push(paragraph);
      }
   }

   // group pieces up to target size, with overlap between chunks
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

   // all children share the parent's page range (no per-paragraph tracking yet)
   return childTexts.map((text, index) => ({
      chunk_id: `${parent.parent_id}-child-${index}`,
      parent_id: parent.parent_id,
      document_id: parent.document_id,
      document_name: parent.document_name,
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
            document_id: parent.document_id,
            document_name: parent.document_name,
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

function buildParentChunks({ flatItems }) {
   const parentChunksMap = new Map();

   for (const item of flatItems) {
      const { section_index, section_title, page_number, document_id, document_name } = item;

      if (!parentChunksMap.has(section_index)) {
         parentChunksMap.set(section_index, {
            parent_id: `${document_id}-section-${section_index}`,
            document_id,
            document_name,
            section_title,
            text: [],
            start_page: page_number,
            end_page: page_number
         });
      }

      const parentChunk = parentChunksMap.get(section_index);

      // skip the heading that started this section — section_title already covers it
      if (!item.is_section_heading) {
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

// shallowest heading level in the doc = section boundary
function detectSectionLevel(pages) {
   let minLevel = Infinity;

   for (const page of pages) {
      for (const item of page.items) {
         if (item.type === 'heading' && item.level < minLevel) {
            minLevel = item.level;
         }
      }
   }

   return minLevel === Infinity ? constants.chunk.DEFAULT_SECTION_LEVEL : minLevel;
}

function flattenAndDetectSections({ data, documentId, documentName }) {
   const flatItems = [];
   const maxSectionHeadingLevel = detectSectionLevel(data.pages);

   let currentSectionIndex = -1;
   let currentSectionTitle = null;

   for (const page of data.pages) {
      for (const item of page.items) {
         // page furniture, not content — skip it
         if (item.type === 'footer' || item.type === 'header') {
            continue;
         }

         // only section-level headings start a new section
         const isSectionHeading = item.type === 'heading' && item.level <= maxSectionHeadingLevel;
         if (isSectionHeading) {
            currentSectionIndex += 1;
            currentSectionTitle = item.value;
         }

         flatItems.push({
            ...item,
            page_number: page.page_number,
            section_index: currentSectionIndex,
            section_title: currentSectionTitle,
            is_section_heading: isSectionHeading,
            document_id: documentId,
            document_name: documentName
         })
      }
   }

   return flatItems;
}

async function saveDocument({ documentId, documentName }) {
   return prismaClient.document.create({
      data: { id: documentId, name: documentName }
   })
}

async function saveParentChunks({ parentChunks }) {
   return prismaClient.parentChunk.createMany({
      data: parentChunks.map(chunk => ({
         id: chunk.parent_id,
         documentId: chunk.document_id,
         sectionTitle: chunk.section_title,
         text: chunk.text,
         startPage: chunk.start_page,
         endPage: chunk.end_page
      }))
   })
}

async function getParentChunkById(parentId) {
   return prismaClient.parentChunk.findUnique({
      where: { id: parentId }
   })
}

export default {
   buildParentChunks,
   flattenAndDetectSections,
   buildChildChunks,
   saveDocument,
   saveParentChunks,
   getParentChunkById
}
