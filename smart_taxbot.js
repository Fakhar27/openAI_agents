import OpenAI from 'openai';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const logger = {
    info: (message, data = null) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] INFO: ${message}`);
        if (data) {
            console.log('Data:', JSON.stringify(data, null, 2));
        }
    },
    error: (message, error = null) => {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] ERROR: ${message}`);
        if (error) {
            console.error('Error details:', error);
        }
    }
};
async function fetchBoeData() {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    logger.info(`Attempting to fetch BOE data for today: ${today}`);

    try {
        const url = `https://boe.es/datosabiertos/api/boe/sumario/${today}`
        logger.info(`Making request to BOE API: ${url}`);

        const response = await axios.get(url, {
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            }
        });

        if (response.status === 200 && response.data) {
            logger.info(`Successfully retrieved BOE data for ${today}`);
            logger.info(`Response size: ${JSON.stringify(response.data).length} characters`);
            return response.data;
        }

        logger.error(`Failed to fetch BOE data`, {
            statusCode: response.status,
            statusText: response.statusText
        });
        return null;
    } catch (error) {
        logger.error(`Error fetching BOE data`, error);
        return null;
    }
}

async function fetchSpecificBoeData(query) {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    logger.info(`Searching BOE data for query: "${query}"`);

    try {
        const url = `https://www.boe.es/datosabiertos/api/boe/sumario/${today}`;
        const response = await axios.get(url, {
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            }
        });

        if (response.status === 200 && response.data) {
            const filteredData = filterBoeDataByQuery(response.data, query);
            logger.info(`Found ${filteredData.items.length} matching items`);
            return filteredData;
        }

        return null;
    } catch (error) {
        logger.error(`Error in fetchSpecificBoeData:`, error);
        return null;
    }
}

function filterBoeDataByQuery(rawData, query) {
    const queryWords = query.toLowerCase().split(/\s+/);
    const filtered = {
        fecha: rawData.data?.data?.sumario?.metadatos?.fecha_publicacion,
        identificador: rawData.data?.data?.sumario?.diario?.[0]?.sumario_diario?.identificador,
        items: []
    };

    try {
        // Get the sections array
        const sections = rawData.data?.data?.sumario?.diario?.[0]?.seccion || [];

        // Process each section
        sections.forEach(section => {
            if (!section.departamento) return;

            section.departamento.forEach(dept => {
                if (!dept.epigrafe) return;

                // Handle both single epigrafe and array of epigrafes
                const epigrafes = Array.isArray(dept.epigrafe) ? dept.epigrafe : [dept.epigrafe];

                epigrafes.forEach(ep => {
                    // Handle both single item and array of items
                    const items = Array.isArray(ep.item) ? ep.item : [ep.item];

                    items.forEach(item => {
                        if (!item) return;

                        // Create searchable text combining all relevant fields
                        const searchText = [
                            item.titulo,
                            item.identificador,
                            dept.nombre,
                            section.nombre,
                            ep.nombre
                        ].filter(Boolean).join(' ').toLowerCase();

                        // Check if all query words match
                        const matches = queryWords.every(word => searchText.includes(word));

                        if (matches) {
                            filtered.items.push({
                                id: item.identificador,
                                departamento: dept.nombre,
                                seccion: section.nombre,
                                epigrafe: ep.nombre,
                                titulo: item.titulo,
                                url_pdf: item.url_pdf?.texto,
                                url_html: item.url_html
                            });
                        }
                    });
                });
            });
        });

        return filtered;

    } catch (error) {
        logger.error('Error in filterBoeDataByQuery:', error);
        return filtered;
    }
}

function itemMatchesQuery(item, queryLower) {
    const titulo = item.titulo?.toLowerCase() || '';
    const id = item.identificador?.toLowerCase() || '';

    const queryWords = queryLower.split(' ');

    return queryWords.every(word =>
        titulo.includes(word) ||
        id.includes(word)
    );
}

async function createAssistant() {
    logger.info('Starting assistant creation/retrieval process');

    try {
        const assistants = await openai.beta.assistants.list({
            order: "desc",
            limit: 100
        });

        const existingAssistant = assistants.data.find(
            assistant => assistant.name === "New myConsultor BETA"
        );

        if (existingAssistant) {
            logger.info(`Found existing assistant with ID: ${existingAssistant.id}`);
            return existingAssistant.id;
        }

        logger.info('Creating new assistant...');
        const assistant = await openai.beta.assistants.create({
            name: "New myConsultor BETA",
            instructions: `
                You are an expert legal consultation assistant specializing in analyzing Spanish laws and regulations.
                
                QUERY TYPES AND HANDLING:
                1. Summary Requests (Uses fetchBoeData):
                   - When users ask for complete BOE summary or today's updates
                   - Keywords: resumen, hoy, summary, today, general, completo
                   - Provide comprehensive overview of all sections
                   - Always include section headers and document references
                
                2. Specific Queries (Uses fetchSpecificBoeData):
                   - When users ask about specific laws, topics, or documents
                   - Examples: "Passport regulations", "environmental laws", "BOE-A-2024-XXXXX"
                   - Focus on relevant items only
                   - Provide detailed analysis of found items
                
                3. Irrelevant Queries (No Function Call):
                   - For non-BOE related questions
                   - Respond: "I specialize in analyzing BOE (Boletín Oficial del Estado) content. 
                     This query appears to be outside my scope. Could you please ask about specific 
                     BOE publications or today's updates?"

                RESPONSE STRUCTURE:
                1. For Summaries:
                   - Begin with BOE publication date and reference
                   - Organize by sections
                   - Highlight key changes and announcements
                   - Include practical implications
                
                2. For Specific Queries:
                   - Start with matched document details
                   - Provide focused analysis
                   - Include references and links
                   - Explain relevance and impact

                ERROR HANDLING:
                - If BOE data unavailable: Clearly state and suggest trying later
                - For unclear queries: Ask for clarification
                - For no matches: Indicate no relevant items found in today's BOE

                Remember:
                1. Only call functions for relevant BOE queries
                2. Maintain focus on legal analysis
                3. Be clear about data availability
                4. Always provide document references when available
            `,
            model: "gpt-4o-mini",
            temperature: 0.7,
            tools: [{
                type: "function",
                function: {
                    name: "fetchBoeData",
                    description: "Fetches complete BOE data for summary requests",
                    parameters: {
                        type: "object",
                        properties: {},
                        additionalProperties: false
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "fetchSpecificBoeData",
                    description: "Searches BOE data for specific queries",
                    parameters: {
                        type: "object",
                        properties: {
                            query: {
                                type: "string",
                                description: "Search query for specific BOE content"
                            }
                        },
                        required: ["query"]
                    }
                }
            }]
        });

        logger.info(`Created new assistant with ID: ${assistant.id}`);
        return assistant.id;
    } catch (error) {
        logger.error('Error in createAssistant:', error);
        throw error;
    }
}

async function processChat(input, threadId, assistantId) {
    logger.info(`Processing chat input: "${input}"`);
    logger.info(`Thread ID: ${threadId}, Assistant ID: ${assistantId}`);

    try {
        if (!threadId) {
            const thread = await openai.beta.threads.create();
            threadId = thread.id;
            logger.info(`Created new thread with ID: ${threadId}`);
        }

        // Determine if it's a summary request
        const summaryKeywords = ['resumen', 'hoy', 'summary', 'today', 'general', 'completo', 'disposiciones'];
        const isSummaryRequest = summaryKeywords.some(keyword =>
            input.toLowerCase().includes(keyword.toLowerCase())
        );

        logger.info(`Query type: ${isSummaryRequest ? 'Summary' : 'Specific'}`);

        // Add user message
        await openai.beta.threads.messages.create(threadId, {
            role: "user",
            content: input
        });

        // Create run
        const run = await openai.beta.threads.runs.create(threadId, {
            assistant_id: assistantId
        });

        let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
        logger.info(`Initial run status: ${runStatus.status}`);

        while (runStatus.status !== "completed") {
            if (runStatus.status === "failed") {
                logger.error('Run failed:', runStatus);
                throw new Error("Run failed");
            }

            if (runStatus.status === "requires_action") {
                logger.info('Run requires action - processing tool calls...');
                const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
                const toolOutputs = [];

                for (const toolCall of toolCalls) {
                    logger.info(`Processing tool call: ${toolCall.function.name}`);
                    try {
                        let data = null;

                        // Handle both types of queries
                        if (toolCall.function.name === "fetchBoeData") {
                            data = await fetchBoeData();
                            logger.info(`Fetched complete BOE data`);
                        } else if (toolCall.function.name === "fetchSpecificBoeData") {
                            const args = JSON.parse(toolCall.function.arguments);
                            // Use the original input for search if no query provided
                            const searchQuery = args.query || input;
                            data = await fetchSpecificBoeData(searchQuery);
                            logger.info(`Fetched specific BOE data for query: "${searchQuery}"`);

                            // Log search results
                            if (data && data.items) {
                                logger.info(`Found ${data.items.length} matching items`);
                            }
                        }

                        if (data) {
                            toolOutputs.push({
                                tool_call_id: toolCall.id,
                                output: JSON.stringify({
                                    data,
                                    queryType: isSummaryRequest ? 'summary' : 'specific',
                                    originalQuery: input
                                })
                            });
                        } else {
                            toolOutputs.push({
                                tool_call_id: toolCall.id,
                                output: JSON.stringify({
                                    error: "No BOE data available",
                                    message: "Could not fetch BOE data for the request",
                                    queryType: isSummaryRequest ? 'summary' : 'specific',
                                    originalQuery: input
                                })
                            });
                        }
                    } catch (error) {
                        logger.error(`Error in ${toolCall.function.name}:`, error);
                        toolOutputs.push({
                            tool_call_id: toolCall.id,
                            output: JSON.stringify({
                                error: "Failed to fetch BOE data",
                                message: error.message,
                                queryType: isSummaryRequest ? 'summary' : 'specific',
                                originalQuery: input
                            })
                        });
                    }
                }

                if (toolOutputs.length > 0) {
                    logger.info(`Submitting ${toolOutputs.length} tool outputs`);
                    await openai.beta.threads.runs.submitToolOutputs(
                        threadId,
                        run.id,
                        { tool_outputs: toolOutputs }
                    );
                }
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
            runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            logger.info(`Updated run status: ${runStatus.status}`);
        }

        const messages = await openai.beta.threads.messages.list(threadId);
        const lastMessage = messages.data[0];
        logger.info('Retrieved assistant response');

        return {
            response: lastMessage.content[0].text.value,
            threadId: threadId
        };
    } catch (error) {
        logger.error('Error in processChat:', error);
        throw error;
    }
}



async function main() {
    try {
        logger.info('Starting ****New myConsultor BETA****');
        const assistantId = await createAssistant();
        logger.info('Assistant initialization complete');

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        let currentThreadId = null;
        logger.info('Chat session started');

        const askQuestion = () => {
            rl.question('You: ', async (input) => {
                if (input.toLowerCase() === 'exit') {
                    logger.info('User requested exit');
                    rl.close();
                    return;
                }

                try {
                    const { response, threadId } = await processChat(input, currentThreadId, assistantId);
                    currentThreadId = threadId;
                    console.log('\nAssistant:', response, '\n');
                } catch (error) {
                    logger.error('Error processing message:', error);
                }

                askQuestion();
            });
        };

        console.log('Chat started. Type "exit" to quit.\n');
        askQuestion();
    } catch (error) {
        logger.error('Error in main:', error);
        process.exit(1);
    }
}

main().catch(error => {
    logger.error('Unhandled error in application:', error);
    process.exit(1);
});





















// async function processChat(input, threadId, assistantId) {
//     logger.info(`Processing chat input: "${input}"`);
//     logger.info(`Thread ID: ${threadId}, Assistant ID: ${assistantId}`);

//     try {
//         if (!threadId) {
//             const thread = await openai.beta.threads.create();
//             threadId = thread.id;
//             logger.info(`Created new thread with ID: ${threadId}`);
//         }

//         // Add user message
//         await openai.beta.threads.messages.create(threadId, {
//             role: "user",
//             content: input
//         });

//         // Create run
//         const run = await openai.beta.threads.runs.create(threadId, {
//             assistant_id: assistantId
//         });

//         let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
//         logger.info(`Initial run status: ${runStatus.status}`);

//         while (runStatus.status !== "completed") {
//             if (runStatus.status === "failed") {
//                 logger.error('Run failed:', runStatus);
//                 throw new Error("Run failed");
//             }

//             if (runStatus.status === "requires_action") {
//                 logger.info('Run requires action - processing tool calls...');
//                 const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
//                 const toolOutputs = [];

//                 for (const toolCall of toolCalls) {
//                     logger.info(`Processing tool call: ${toolCall.function.name}`);
//                     try {
//                         let data = null;

//                         if (toolCall.function.name === "fetchBoeData") {
//                             data = await fetchBoeData();
//                         } else if (toolCall.function.name === "fetchSpecificBoeData") {
//                             const args = JSON.parse(toolCall.function.arguments);
//                             data = await fetchSpecificBoeData(args.query);
//                         }

//                         if (data) {
//                             toolOutputs.push({
//                                 tool_call_id: toolCall.id,
//                                 output: JSON.stringify(data)
//                             });
//                         } else {
//                             toolOutputs.push({
//                                 tool_call_id: toolCall.id,
//                                 output: JSON.stringify({
//                                     error: "No BOE data available",
//                                     message: "Could not fetch BOE data for the request"
//                                 })
//                             });
//                         }
//                     } catch (error) {
//                         logger.error(`Error in ${toolCall.function.name}:`, error);
//                         toolOutputs.push({
//                             tool_call_id: toolCall.id,
//                             output: JSON.stringify({
//                                 error: "Failed to fetch BOE data",
//                                 message: error.message
//                             })
//                         });
//                     }
//                 }

//                 if (toolOutputs.length > 0) {
//                     await openai.beta.threads.runs.submitToolOutputs(
//                         threadId,
//                         run.id,
//                         { tool_outputs: toolOutputs }
//                     );
//                 }
//             }

//             await new Promise(resolve => setTimeout(resolve, 1000));
//             runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
//             logger.info(`Updated run status: ${runStatus.status}`);
//         }

//         const messages = await openai.beta.threads.messages.list(threadId);
//         const lastMessage = messages.data[0];
//         logger.info('Retrieved assistant response');

//         return {
//             response: lastMessage.content[0].text.value,
//             threadId: threadId
//         };
//     } catch (error) {
//         logger.error('Error in processChat:', error);
//         throw error;
//     }
// }