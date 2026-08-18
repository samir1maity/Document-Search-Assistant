const constants = {
    chunk: {
        MAX_CHILD_CHUNK_TOKENS: 50,
        TARGET_CHILD_CHUNK_TOKENS: 25,
        OVERLAP_TOKENS: 10
    },
    embedding: {
        // cheapest OpenAI embedding model — $0.02/1M tokens vs $0.13/1M for -large
        MODEL: 'text-embedding-3-small'
    }
}

export default constants;