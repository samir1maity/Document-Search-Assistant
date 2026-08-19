const constants = {
    chunk: {
        MAX_CHILD_CHUNK_TOKENS: 50,
        TARGET_CHILD_CHUNK_TOKENS: 25,
        OVERLAP_TOKENS: 10,
        DEFAULT_SECTION_LEVEL: 2
    },
    embedding: {
        MODEL: 'text-embedding-3-small',
        DIMENSIONS: 1536
    },
    qdrant: {
        COLLECTION_NAME: 'child_chunks',
        DISTANCE: 'Cosine'
    }
}

export default constants;