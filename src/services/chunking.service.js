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
   handlePdfData
}
