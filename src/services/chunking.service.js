function handleChunking({ data }) {
    
}

function handlePdfData({ data }) {
   const flatItems = [];

   for (const page of data.pages) {
      for (const item of page.items) {
         flatItems.push({ ...item, page_number: page.page_number })
      }
   }

   return flatItems;
}

export default {
   handleChunking,
   handlePdfData
}
