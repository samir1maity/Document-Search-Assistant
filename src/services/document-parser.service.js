import fs from "fs";
import llamaCloudClient from '../config/llama-cloud.client.js'

const filename = "/Users/samirmaity/projects/ai-learning/ai-doc-intelligence-platform/pdf-sample_0.pdf";

async function documentParser() {
    const result = await llamaCloudClient.parsing.parse({
        tier: "agentic",
        version: "latest",
        upload_file: fs.createReadStream(filename),
        expand: ["markdown_full"],
    });
    console.log('result.markdown_full', result.markdown_full)
    return result.markdown_full;
}

export default {
    documentParser
};
