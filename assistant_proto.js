// apiKey: ""
import OpenAI from 'openai';
import axios from 'axios';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({
    apiKey: process.env.OPENAI
});

const logger = {
    info: (message) => console.log(`[${new Date().toISOString()}] INFO: ${message}`),
    error: (message, error) => {
        console.error(`[${new Date().toISOString()}] ERROR: ${message}`);
        if (error) console.error('Error details:', error);
    }
};

async function fetchBoeData() {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    logger.info(`Attempting to fetch BOE data for today: ${today}`);

    try {
        const url = `https://www.boe.es/datosabiertos/api/boe/sumario/${today}`;
        logger.info(`Making request to BOE API: ${url}`);

        const response = await axios.get(url, {
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            }
        });

        if (response.status === 200 && response.data) {
            logger.info(`Successfully retrieved BOE data for ${today}`);
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

async function createAssistant() {
    logger.info('Starting assistant creation/retrieval process');

    try {
        const assistants = await openai.beta.assistants.list({
            order: "desc",
            limit: 100
        });

        const existingAssistant = assistants.data.find(
            assistant => assistant.name === "Spanish BOE Legal Assistant with File Analysis"
        );

        if (existingAssistant) {
            logger.info(`Found existing assistant with ID: ${existingAssistant.id}`);
            return existingAssistant.id;
        }

        logger.info('Creating new assistant...');
        const assistant = await openai.beta.assistants.create({
            name: "Spanish BOE Legal Assistant with File Analysis",
            instructions: `
                You are an expert legal consultation assistant specializing in Spanish laws, regulations, and the Boletín Oficial del Estado (BOE).
                Your primary duties are:
                - To analyze BOE data, Spanish legal matters, and uploaded documents, providing comprehensive and detailed responses.
                - To focus strictly on legal, BOE-related, or document-provided contexts.
                
                **Important Instructions**:
                - If a query is outside these domains, respond with:
                  "I'm here to assist with Spanish legal matters, BOE publications, or uploaded documents. I cannot provide insights on unrelated topics."
                - Be detailed and concise when responding to legal queries, ensuring clarity and relevance.
            `,
            model: "gpt-4o-mini",
            tools: [
                {
                    type: "function",
                    function: {
                        name: "fetchBoeData",
                        description: "Fetches today's BOE data",
                        parameters: {
                            type: "object",
                            properties: {},
                            required: []
                        }
                    }
                },
                { type: "file_search" }
            ]
        });

        logger.info(`Created new assistant with ID: ${assistant.id}`);
        return assistant.id;
    } catch (error) {
        logger.error('Error in createAssistant:', error);
        throw error;
    }
}

async function processChat(input, threadId, assistantId, filePaths = []) {
    logger.info(`Processing chat input: "${input}"`);
    logger.info(`Thread ID: ${threadId || 'new'}, Assistant ID: ${assistantId}`);

    try {
        // Handle file uploads if provided
        const attachments = [];
        if (filePaths && filePaths.length > 0) {
            for (const filePath of filePaths) {
                if (fs.existsSync(filePath)) {
                    logger.info(`Uploading file: ${filePath}`);
                    const file = await openai.files.create({
                        file: fs.createReadStream(filePath),
                        purpose: "assistants"
                    });
                    logger.info(`File uploaded with ID: ${file.id}`);

                    // Create proper attachment structure
                    attachments.push({
                        file_id: file.id,
                        tools: [{ type: "file_search" }]
                    });
                } else {
                    logger.error(`File does not exist: ${filePath}`);
                }
            }
        }

        // Create or use existing thread
        if (!threadId) {
            // If we have files, create thread with initial message and attachments
            if (attachments.length > 0) {
                const thread = await openai.beta.threads.create({
                    messages: [{
                        role: "user",
                        content: input,
                        attachments: attachments
                    }]
                });
                threadId = thread.id;
                logger.info(`Created new thread with attachments, ID: ${threadId}`);

                // **Set Vector Store Expiration to One Day**
                if (thread.tool_resources && thread.tool_resources.file_search) {
                    const vectorStoreId = thread.tool_resources.file_search.vector_store_ids[0];
                    logger.info(`Thread vector store ID: ${vectorStoreId}`);

                    // Update the vector store to set the expiration policy
                    await openai.beta.vectorStores.update(vectorStoreId, {
                        expires_after: {
                            anchor: "last_active_at",
                            days: 1
                        }
                    });
                    logger.info(`Set vector store ${vectorStoreId} to expire after 1 day`);
                }
            } else {
                // Create empty thread for non-file messages
                const thread = await openai.beta.threads.create();
                threadId = thread.id;
                logger.info(`Created new empty thread, ID: ${threadId}`);

                // Add the message separately
                await openai.beta.threads.messages.create(threadId, {
                    role: "user",
                    content: input
                });
            }
        } else {
            // Add message to existing thread
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: input,
                attachments: attachments.length > 0 ? attachments : undefined
            });

            // **Update Vector Store Expiration if Attachments are Added**
            if (attachments.length > 0) {
                // Retrieve the updated thread to get tool_resources
                const thread = await openai.beta.threads.retrieve(threadId);
                if (thread.tool_resources && thread.tool_resources.file_search) {
                    const vectorStoreId = thread.tool_resources.file_search.vector_store_ids[0];
                    logger.info(`Thread vector store ID: ${vectorStoreId}`);

                    // Update the vector store to set the expiration policy
                    await openai.beta.vectorStores.update(vectorStoreId, {
                        expires_after: {
                            anchor: "last_active_at",
                            days: 1
                        }
                    });
                    logger.info(`Set vector store ${vectorStoreId} to expire after 1 day`);
                }
            }
        }
        // Create run
        const runOptions = {
            assistant_id: assistantId
        };

        // Only enable tool calling if it's a BOE-related query or if files are attached
        const boeRelatedKeywords = ['boe', 'legal', 'law', 'regulation', 'ministry', 'government', 'official', 'spain', 'spanish'];
        const isBoERelated = boeRelatedKeywords.some(keyword =>
            input.toLowerCase().includes(keyword.toLowerCase())
        );

        if (!isBoERelated && attachments.length === 0) {
            runOptions.tools = [];
        }

        const run = await openai.beta.threads.runs.create(threadId, runOptions);
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
                    if (toolCall.function.name === "fetchBoeData") {
                        logger.info(`Processing tool call: ${toolCall.function.name}`);
                        try {
                            const data = await fetchBoeData();
                            toolOutputs.push({
                                tool_call_id: toolCall.id,
                                output: JSON.stringify(data || {
                                    error: "No BOE data available",
                                    message: "Could not fetch BOE data for the requested date"
                                })
                            });
                        } catch (error) {
                            logger.error('Error in fetchBoeData:', error);
                            toolOutputs.push({
                                tool_call_id: toolCall.id,
                                output: JSON.stringify({
                                    error: "Failed to fetch BOE data",
                                    message: error.message
                                })
                            });
                        }
                    }
                }

                if (toolOutputs.length > 0) {
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
        const lastMessage = messages.data.find(msg => msg.role === 'assistant');
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
        logger.info('Starting BOE Assistant application...');
        const assistantId = await createAssistant();
        logger.info('Assistant initialization complete');

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        let currentThreadId = null;
        logger.info('Chat session started');

        const askQuestion = () => {
            rl.question('\nYou (type "exit" to quit, or "attach" to attach files): ', async (input) => {
                if (input.toLowerCase() === 'exit') {
                    logger.info('User requested exit');
                    rl.close();
                    return;
                }

                if (input.toLowerCase() === 'attach') {
                    rl.question('Enter file paths (comma-separated): ', async (filePaths) => {
                        const files = filePaths.split(',').map(p => p.trim());
                        rl.question('Enter your message: ', async (message) => {
                            try {
                                const { response, threadId } = await processChat(
                                    message,
                                    currentThreadId,
                                    assistantId,
                                    files
                                );
                                currentThreadId = threadId;
                                console.log('\nAssistant:', response, '\n');
                            } catch (error) {
                                logger.error('Error processing message with files:', error);
                                console.log('\nError: Failed to process message with files\n');
                            }
                            askQuestion();
                        });
                    });
                } else {
                    try {
                        const { response, threadId } = await processChat(
                            input,
                            currentThreadId,
                            assistantId
                        );
                        currentThreadId = threadId;
                        console.log('\nAssistant:', response, '\n');
                    } catch (error) {
                        logger.error('Error processing message:', error);
                        console.log('\nError: Failed to process message\n');
                    }
                    askQuestion();
                }
            });
        };

        console.log('Chat started. Type "exit" to quit, or "attach" to attach files.\n');
        askQuestion();
    } catch (error) {
        logger.error('Error in main:', error);
        process.exit(1);
    }
}
main();







































// const logger = {
//     info: (message) => console.log(`[${new Date().toISOString()}] INFO: ${message}`),
//     error: (message, error) => {
//         console.error(`[${new Date().toISOString()}] ERROR: ${message}`);
//         if (error) console.error('Error details:', error);
//     }
// };

// async function fetchBoeData() {
//     const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
//     logger.info(`Attempting to fetch BOE data for today: ${today}`);

//     try {
//         const url = `https://www.boe.es/datosabiertos/api/boe/sumario/${today}`;
//         logger.info(`Making request to BOE API: ${url}`);

//         const response = await axios.get(url, {
//             headers: {
//                 "Accept": "application/json",
//                 "Content-Type": "application/json"
//             }
//         });

//         if (response.status === 200 && response.data) {
//             logger.info(`Successfully retrieved BOE data for ${today}`);
//             return response.data;
//         }

//         logger.error(`Failed to fetch BOE data`, {
//             statusCode: response.status,
//             statusText: response.statusText
//         });
//         return null;
//     } catch (error) {
//         logger.error(`Error fetching BOE data`, error);
//         return null;
//     }
// }

// async function createAssistant() {
//     logger.info('Starting assistant creation/retrieval process');

//     try {
//         const assistants = await openai.beta.assistants.list({
//             order: "desc",
//             limit: 100
//         });

//         const existingAssistant = assistants.data.find(
//             assistant => assistant.name === "Spanish BOE Legal Assistant with File Analysis"
//         );

//         if (existingAssistant) {
//             logger.info(`Found existing assistant with ID: ${existingAssistant.id}`);
//             return existingAssistant.id;
//         }

//         logger.info('Creating new assistant...');
//         const assistant = await openai.beta.assistants.create({
//             name: "Spanish BOE Legal Assistant with File Analysis",
//             instructions: `
//                 You are an expert legal consultation assistant specializing in analyzing Spanish laws, regulations, and legal documents.
//                 Your primary responsibilities are to analyze BOE data and legal documents provided by the user, offering comprehensive and detailed legal insights.
//                 **Important:** Do not respond to queries unrelated to Spanish legal matters, BOE data, or the documents provided by the user. If a query is outside these domains, politely inform the user that you can only assist with legal-related questions.
//             `,
//             model: "gpt-4o-mini",
//             tools: [
//                 {
//                     type: "function",
//                     function: {
//                         name: "fetchBoeData",
//                         description: "Fetches today's BOE data",
//                         parameters: {
//                             type: "object",
//                             properties: {},
//                             required: []
//                         }
//                     }
//                 },
//                 { type: "file_search" }
//             ]
//         });

//         logger.info(`Created new assistant with ID: ${assistant.id}`);
//         return assistant.id;
//     } catch (error) {
//         logger.error('Error in createAssistant:', error);
//         throw error;
//     }
// }

// async function processChat(input, threadId, assistantId, filePaths = []) {
//     logger.info(`Processing chat input: "${input}"`);
//     logger.info(`Thread ID: ${threadId || 'new'}, Assistant ID: ${assistantId}`);

//     try {
//         // Handle file uploads if provided
//         const attachments = [];
//         if (filePaths && filePaths.length > 0) {
//             for (const filePath of filePaths) {
//                 if (fs.existsSync(filePath)) {
//                     logger.info(`Uploading file: ${filePath}`);
//                     const file = await openai.files.create({
//                         file: fs.createReadStream(filePath),
//                         purpose: "assistants"
//                     });
//                     logger.info(`File uploaded with ID: ${file.id}`);

//                     // Create proper attachment structure
//                     attachments.push({
//                         file_id: file.id,
//                         tools: [{ type: "file_search" }]
//                     });
//                 } else {
//                     logger.error(`File does not exist: ${filePath}`);
//                 }
//             }
//         }

//         // Create or use existing thread
//         if (!threadId) {
//             // If we have files, create thread with initial message and attachments
//             if (attachments.length > 0) {
//                 const thread = await openai.beta.threads.create({
//                     messages: [{
//                         role: "user",
//                         content: input,
//                         attachments: attachments
//                     }]
//                 });
//                 threadId = thread.id;
//                 logger.info(`Created new thread with attachments, ID: ${threadId}`);

//                 // **Set Vector Store Expiration to One Day**
//                 if (thread.tool_resources && thread.tool_resources.file_search) {
//                     const vectorStoreId = thread.tool_resources.file_search.vector_store_ids[0];
//                     logger.info(`Thread vector store ID: ${vectorStoreId}`);

//                     // Update the vector store to set the expiration policy
//                     await openai.beta.vectorStores.update(vectorStoreId, {
//                         expires_after: {
//                             anchor: "last_active_at",
//                             days: 1
//                         }
//                     });
//                     logger.info(`Set vector store ${vectorStoreId} to expire after 1 day`);
//                 }
//             } else {
//                 // Create empty thread for non-file messages
//                 const thread = await openai.beta.threads.create();
//                 threadId = thread.id;
//                 logger.info(`Created new empty thread, ID: ${threadId}`);

//                 // Add the message separately
//                 await openai.beta.threads.messages.create(threadId, {
//                     role: "user",
//                     content: input
//                 });
//             }
//         } else {
//             // Add message to existing thread
//             await openai.beta.threads.messages.create(threadId, {
//                 role: "user",
//                 content: input,
//                 attachments: attachments.length > 0 ? attachments : undefined
//             });

//             // **Update Vector Store Expiration if Attachments are Added**
//             if (attachments.length > 0) {
//                 // Retrieve the updated thread to get tool_resources
//                 const thread = await openai.beta.threads.retrieve(threadId);
//                 if (thread.tool_resources && thread.tool_resources.file_search) {
//                     const vectorStoreId = thread.tool_resources.file_search.vector_store_ids[0];
//                     logger.info(`Thread vector store ID: ${vectorStoreId}`);

//                     // Update the vector store to set the expiration policy
//                     await openai.beta.vectorStores.update(vectorStoreId, {
//                         expires_after: {
//                             anchor: "last_active_at",
//                             days: 1
//                         }
//                     });
//                     logger.info(`Set vector store ${vectorStoreId} to expire after 1 day`);
//                 }
//             }
//         }

//         // **Optional: Ensure Vector Store is Ready Before Creating Run**
//         // Uncomment the following block if you want to wait for the vector store to be ready
//         /*
//         if (attachments.length > 0) {
//             const vectorStoreId = thread.tool_resources.file_search.vector_store_ids[0];
//             logger.info(`Waiting for vector store ${vectorStoreId} to be ready...`);

//             let vectorStoreStatus = await openai.beta.vectorStores.retrieve(vectorStoreId);
//             while (vectorStoreStatus.status !== "completed") {
//                 if (vectorStoreStatus.status === "failed") {
//                     logger.error('Vector store processing failed:', vectorStoreStatus);
//                     throw new Error("Vector store processing failed");
//                 }

//                 await new Promise(resolve => setTimeout(resolve, 5000));
//                 vectorStoreStatus = await openai.beta.vectorStores.retrieve(vectorStoreId);
//                 logger.info(`Vector store status: ${vectorStoreStatus.status}`);
//             }

//             logger.info(`Vector store ${vectorStoreId} is ready`);
//         }
//         */

//         // Create run
//         const runOptions = {
//             assistant_id: assistantId
//         };

//         // Only enable tool calling if it's a BOE-related query or if files are attached
//         const boeRelatedKeywords = ['boe', 'legal', 'law', 'regulation', 'ministry', 'government', 'official', 'spain', 'spanish'];
//         const isBoERelated = boeRelatedKeywords.some(keyword =>
//             input.toLowerCase().includes(keyword.toLowerCase())
//         );

//         if (!isBoERelated && attachments.length === 0) {
//             runOptions.tools = [];
//         }

//         const run = await openai.beta.threads.runs.create(threadId, runOptions);
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
//                     if (toolCall.function.name === "fetchBoeData") {
//                         logger.info(`Processing tool call: ${toolCall.function.name}`);
//                         try {
//                             const data = await fetchBoeData();
//                             toolOutputs.push({
//                                 tool_call_id: toolCall.id,
//                                 output: JSON.stringify(data || {
//                                     error: "No BOE data available",
//                                     message: "Could not fetch BOE data for the requested date"
//                                 })
//                             });
//                         } catch (error) {
//                             logger.error('Error in fetchBoeData:', error);
//                             toolOutputs.push({
//                                 tool_call_id: toolCall.id,
//                                 output: JSON.stringify({
//                                     error: "Failed to fetch BOE data",
//                                     message: error.message
//                                 })
//                             });
//                         }
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
//         const lastMessage = messages.data.find(msg => msg.role === 'assistant');
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

// async function main() {
//     try {
//         logger.info('Starting BOE Assistant application...');
//         const assistantId = await createAssistant();
//         logger.info('Assistant initialization complete');

//         const rl = readline.createInterface({
//             input: process.stdin,
//             output: process.stdout
//         });

//         let currentThreadId = null;
//         logger.info('Chat session started');

//         const askQuestion = () => {
//             rl.question('\nYou (type "exit" to quit, or "attach" to attach files): ', async (input) => {
//                 if (input.toLowerCase() === 'exit') {
//                     logger.info('User requested exit');
//                     rl.close();
//                     return;
//                 }

//                 if (input.toLowerCase() === 'attach') {
//                     rl.question('Enter file paths (comma-separated): ', async (filePaths) => {
//                         const files = filePaths.split(',').map(p => p.trim());
//                         rl.question('Enter your message: ', async (message) => {
//                             try {
//                                 const { response, threadId } = await processChat(
//                                     message,
//                                     currentThreadId,
//                                     assistantId,
//                                     files
//                                 );
//                                 currentThreadId = threadId;
//                                 console.log('\nAssistant:', response, '\n');
//                             } catch (error) {
//                                 logger.error('Error processing message with files:', error);
//                                 console.log('\nError: Failed to process message with files\n');
//                             }
//                             askQuestion();
//                         });
//                     });
//                 } else {
//                     try {
//                         const { response, threadId } = await processChat(
//                             input,
//                             currentThreadId,
//                             assistantId
//                         );
//                         currentThreadId = threadId;
//                         console.log('\nAssistant:', response, '\n');
//                     } catch (error) {
//                         logger.error('Error processing message:', error);
//                         console.log('\nError: Failed to process message\n');
//                     }
//                     askQuestion();
//                 }
//             });
//         };

//         console.log('Chat started. Type "exit" to quit, or "attach" to attach files.\n');
//         askQuestion();
//     } catch (error) {
//         logger.error('Error in main:', error);
//         process.exit(1);
//     }
// }

// // Start the application
// main();




























// async function createAssistant() {
    //     logger.info('Starting assistant creation/retrieval process');
    
    //     try {
    //         const assistants = await openai.beta.assistants.list({
    //             order: "desc",
    //             limit: 100
    //         });
    
    //         const existingAssistant = assistants.data.find(
    //             assistant => assistant.name === "Spanish BOE Legal Assistant with File Analysis"
    //         );
    
    //         if (existingAssistant) {
    //             logger.info(`Found existing assistant with ID: ${existingAssistant.id}`);
    //             return existingAssistant.id;
    //         }
    
    //         logger.info('Creating new assistant...');
    //         const assistant = await openai.beta.assistants.create({
    //             name: "Spanish BOE Legal Assistant with File Analysis",
    //             instructions: `
    //                 You are an expert legal consultation assistant specializing in analyzing Spanish laws, regulations, and legal documents.
    //                 Your primary responsibilities are to analyze BOE data and legal documents, providing comprehensive insights.
    //             `,
    //             model: "gpt-4o-mini",
    //             tools: [
    //                 {
    //                     type: "function",
    //                     function: {
    //                         name: "fetchBoeData",
    //                         description: "Fetches today's BOE data",
    //                         parameters: {
    //                             type: "object",
    //                             properties: {},
    //                             required: []
    //                         }
    //                     }
    //                 },
    //                 { type: "file_search" }
    //             ]
    //         });
    
    //         logger.info(`Created new assistant with ID: ${assistant.id}`);
    //         return assistant.id;
    //     } catch (error) {
    //         logger.error('Error in createAssistant:', error);
    //         throw error;
    //     }
    // }
    

// async function processChat(input, threadId, assistantId, filePaths = []) {
//     logger.info(`Processing chat input: "${input}"`);
//     logger.info(`Thread ID: ${threadId || 'new'}, Assistant ID: ${assistantId}`);

//     try {
//         // Handle file uploads if provided
//         const attachments = [];
//         if (filePaths && filePaths.length > 0) {
//             for (const filePath of filePaths) {
//                 if (fs.existsSync(filePath)) {
//                     logger.info(`Uploading file: ${filePath}`);
//                     const file = await openai.files.create({
//                         file: fs.createReadStream(filePath),
//                         purpose: "assistants"
//                     });
//                     logger.info(`File uploaded with ID: ${file.id}`);
                    
//                     // Create proper attachment structure
//                     attachments.push({
//                         file_id: file.id,
//                         tools: [{ type: "file_search" }]
//                     });
//                 }
//             }
//         }

//         // Create or use existing thread
//         if (!threadId) {
//             // If we have files, create thread with initial message and attachments
//             if (attachments.length > 0) {
//                 const thread = await openai.beta.threads.create({
//                     messages: [{
//                         role: "user",
//                         content: input,
//                         attachments: attachments
//                     }]
//                 });
//                 threadId = thread.id;
//                 logger.info(`Created new thread with attachments, ID: ${threadId}`);
//             } else {
//                 // Create empty thread for non-file messages
//                 const thread = await openai.beta.threads.create();
//                 threadId = thread.id;
//                 logger.info(`Created new empty thread, ID: ${threadId}`);
                
//                 // Add the message separately
//                 await openai.beta.threads.messages.create(threadId, {
//                     role: "user",
//                     content: input
//                 });
//             }
//         } else {
//             // Add message to existing thread
//             await openai.beta.threads.messages.create(threadId, {
//                 role: "user",
//                 content: input,
//                 attachments: attachments.length > 0 ? attachments : undefined
//             });
//         }

//         // Create run
//         const runOptions = {
//             assistant_id: assistantId
//         };

//         // Only enable tool calling if it's a BOE-related query
//         const boeRelatedKeywords = ['boe', 'legal', 'law', 'regulation', 'ministry', 'government', 'official', 'spain', 'spanish'];
//         const isBoERelated = boeRelatedKeywords.some(keyword => 
//             input.toLowerCase().includes(keyword.toLowerCase())
//         );

//         if (!isBoERelated) {
//             runOptions.tools = [];
//         }

//         const run = await openai.beta.threads.runs.create(threadId, runOptions);
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
//                     if (toolCall.function.name === "fetchBoeData") {
//                         logger.info(`Processing tool call: ${toolCall.function.name}`);
//                         try {
//                             const data = await fetchBoeData();
//                             toolOutputs.push({
//                                 tool_call_id: toolCall.id,
//                                 output: JSON.stringify(data || {
//                                     error: "No BOE data available",
//                                     message: "Could not fetch BOE data for the requested date"
//                                 })
//                             });
//                         } catch (error) {
//                             logger.error('Error in fetchBoeData:', error);
//                             toolOutputs.push({
//                                 tool_call_id: toolCall.id,
//                                 output: JSON.stringify({
//                                     error: "Failed to fetch BOE data",
//                                     message: error.message
//                                 })
//                             });
//                         }
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

// async function main() {
//     try {
//         logger.info('Starting BOE Assistant application...');
//         const assistantId = await createAssistant();
//         logger.info('Assistant initialization complete');

//         const rl = readline.createInterface({
//             input: process.stdin,
//             output: process.stdout
//         });

//         let currentThreadId = null;
//         logger.info('Chat session started');

//         const askQuestion = () => {
//             rl.question('\nYou (type "exit" to quit, or "attach" to attach files): ', async (input) => {
//                 if (input.toLowerCase() === 'exit') {
//                     logger.info('User requested exit');
//                     rl.close();
//                     return;
//                 }

//                 if (input.toLowerCase() === 'attach') {
//                     rl.question('Enter file paths (comma-separated): ', async (filePaths) => {
//                         const files = filePaths.split(',').map(p => p.trim());
//                         rl.question('Enter your message: ', async (message) => {
//                             try {
//                                 const { response, threadId } = await processChat(
//                                     message,
//                                     currentThreadId,  // <-- threadId
//                                     assistantId,      // <-- assistantId
//                                     files
//                                 );
//                                 currentThreadId = threadId;
//                                 console.log('\nAssistant:', response, '\n');
//                             } catch (error) {
//                                 logger.error('Error processing message with files:', error);
//                                 console.log('\nError: Failed to process message with files\n');
//                             }
//                             askQuestion();
//                         });
//                     });
//                 } else {
//                     try {
//                         const { response, threadId } = await processChat(
//                             input,
//                             currentThreadId,  // <-- threadId
//                             assistantId       // <-- assistantId
//                         );
//                         currentThreadId = threadId;
//                         console.log('\nAssistant:', response, '\n');
//                     } catch (error) {
//                         logger.error('Error processing message:', error);
//                         console.log('\nError: Failed to process message\n');
//                     }
//                     askQuestion();
//                 }
//             });
//         };

//         console.log('Chat started. Type "exit" to quit, or "attach" to attach files.\n');
//         askQuestion();
//     } catch (error) {
//         logger.error('Error in main:', error);
//         process.exit(1);
//     }
// }

// // Start the application
// main();















// async function processChat(input, threadId, assistantId, filePaths = []) {
//     logger.info(`Processing chat input: "${input}"`);
//     logger.info(`Thread ID: ${threadId}, Assistant ID: ${assistantId}`);

//     try {
//         // Handle file uploads if provided
//         const fileAttachments = [];
//         if (filePaths && filePaths.length > 0) {
//             for (const filePath of filePaths) {
//                 if (fs.existsSync(filePath)) {
//                     const fileId = await uploadFile(filePath);
//                     fileAttachments.push({
//                         type: "file",
//                         file_id: fileId
//                     });
//                 }
//             }
//         }

//         // Create or retrieve thread
//         if (!threadId) {
//             const thread = await openai.beta.threads.create();
//             threadId = thread.id;
//             logger.info(`Created new thread with ID: ${threadId}`);
//         }

//         // Add user message with files if any
//         const messageContent = {
//             role: "user",
//             content: fileAttachments.length > 0 ? [
//                 { type: "text", text: input },
//                 ...fileAttachments
//             ] : input
//         };

//         await openai.beta.threads.messages.create(threadId, messageContent);

//         // Create run
//         const run = await openai.beta.threads.runs.create(threadId, {
//             assistant_id: assistantId
//         });

//         let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
//         logger.info(`Initial run status: ${runStatus.status}`);

//         // Rest of your existing run status handling code remains the same
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
//                     if (toolCall.function.name === "fetchBoeData") {
//                         logger.info(`Processing tool call: ${toolCall.function.name}`);
//                         try {
//                             const data = await fetchBoeData();
//                             if (data) {
//                                 toolOutputs.push({
//                                     tool_call_id: toolCall.id,
//                                     output: JSON.stringify(data)
//                                 });
//                             } else {
//                                 toolOutputs.push({
//                                     tool_call_id: toolCall.id,
//                                     output: JSON.stringify({
//                                         error: "No BOE data available",
//                                         message: "Could not fetch BOE data for the requested date"
//                                     })
//                                 });
//                             }
//                         } catch (error) {
//                             logger.error('Error in fetchBoeData:', error);
//                             toolOutputs.push({
//                                 tool_call_id: toolCall.id,
//                                 output: JSON.stringify({
//                                     error: "Failed to fetch BOE data",
//                                     message: error.message
//                                 })
//                             });
//                         }
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

// async function createAssistant() {
    //     logger.info('Starting assistant creation/retrieval process');
    
    //     try {
    //         const assistants = await openai.beta.assistants.list({
    //             order: "desc",
    //             limit: 100
    //         });
    
    //         const existingAssistant = assistants.data.find(
    //             assistant => assistant.name === "Spanish BOE Legal Assistant with File Analysis"
    //         );
    
    //         if (existingAssistant) {
    //             logger.info(`Found existing assistant with ID: ${existingAssistant.id}`);
    //             return existingAssistant.id;
    //         }
    
    //         logger.info('Creating new assistant...');
    //         const assistant = await openai.beta.assistants.create({
    //             name: "Spanish BOE Legal Assistant with File Analysis",
    //             instructions: `
    //                 You are an expert legal consultation assistant specializing in analyzing Spanish laws, regulations, and legal documents.
    //                 Your primary responsibilities:
                    
    //                 1. When processing queries:
    //                    - ALWAYS fetch and analyze current BOE data for context
    //                    - If user provides documents, analyze them in conjunction with BOE data
    //                    - Combine insights from both sources for comprehensive answers
                    
    //                 2. For BOE analysis:
    //                    - Begin with stating the BOE publication date
    //                    - Summarize key legislative changes
    //                    - Highlight important announcements
    //                    - Explain practical implications
                    
    //                 3. For document analysis:
    //                    - Analyze user-provided legal documents
    //                    - Cross-reference with BOE data
    //                    - Identify relevant connections and implications
    //                    - Highlight any conflicts or alignments with current BOE updates
                    
    //                 4. Response structure:
    //                    - Start with BOE reference and date
    //                    - Provide document analysis (if applicable)
    //                    - Give integrated analysis combining both sources
    //                    - List practical implications and recommendations
    //                    - Include relevant citations and references
                    
    //                 5. Always:
    //                    - Use your legal expertise for context
    //                    - Explain technical terms
    //                    - Provide clear, actionable insights
    //                    - Highlight any important deadlines or dates
                    
    //                 Remember: Accuracy and comprehensiveness are crucial. Always analyze both BOE data
    //                 and user documents when available, providing integrated insights that consider all sources.
    //             `,
    //             model: "gpt-4o-mini",
    //             tools: [
    //                 {
    //                     type: "function",
    //                     function: {
    //                         name: "fetchBoeData",
    //                         description: "Fetches today's BOE (Boletín Oficial del Estado) data",
    //                         parameters: {
    //                             type: "object",
    //                             properties: {},
    //                             required: []
    //                         }
    //                     }
    //                 },
    //                 { type: "file_search" }
    //             ]
    //         });
    
    //         logger.info(`Created new assistant with ID: ${assistant.id}`);
    //         return assistant.id;
    //     } catch (error) {
    //         logger.error('Error in createAssistant:', error);
    //         throw error;
    //     }
    // }







//     const functions = require('firebase-functions');
// const axios = require('axios');
// const admin = require('firebase-admin');
// const OpenAI = require('openai');
// const cors = require('cors')({
//   origin: [
//     'https://my-consultor-0lykp4.flutterflow.app',
//     'http://localhost',
//     'https://myconsultor-468c0.firebaseapp.com',
//     'https://myconsultor-468c0.web.app',
//     'https://ff-debug-service-frontend-free-ygxkweukma-uc.a.run.app',
//     'https://app.flutterflow.io'
//   ]
// });
// // To avoid deployment errors, do not call admin.initializeApp() in your code

// const openai = new OpenAI({
//   apiKey: ""
// });

// const logger = {
//   info: (message) => console.log(`[${new Date().toISOString()}] INFO: ${message}`),
//   error: (message, error) => {
//     console.error(`[${new Date().toISOString()}] ERROR: ${message}`);
//     if (error) console.error('Error details:', error);
//   }
// };

// async function fetchBoeData() {
//   const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
//   logger.info(`Attempting to fetch BOE data for today: ${today}`);

//   try {
//     const url = `https://www.boe.es/datosabiertos/api/boe/sumario/${today}`;
//     logger.info(`Making request to BOE API: ${url}`);

//     const response = await axios.get(url, {
//       headers: {
//         "Accept": "application/json",
//         "Content-Type": "application/json"
//       },
//       timeout: 30000, // Increase timeout to 30 seconds
//       retry: 3, // Add retry logic
//       retryDelay: 1000
//     });

//     if (response.status === 200 && response.data) {
//       logger.info(`Successfully retrieved BOE data for ${today}`);
//       return response.data;
//     }

//     // If no data
//     return {
//       error: "No BOE data available",
//       date: today
//     };

//   } catch (error) {
//     logger.error(`Error fetching BOE data: ${error.message}`, error);
//     return {
//       error: "Failed to fetch BOE data",
//       message: error.message,
//       date: today
//     };
//   }
// }

// async function processChat(input, threadId, assistantId) {
//   logger.info(`Processing chat input: "${input}"`);
//   logger.info(`Thread ID: ${threadId}, Assistant ID: ${assistantId}`);

//   try {
//     // Create thread if none exists
//     if (!threadId) {
//       const thread = await openai.beta.threads.create();
//       threadId = thread.id;
//       logger.info(`Created new thread with ID: ${threadId}`);
//     }

//     // Add message to thread
//     await openai.beta.threads.messages.create(threadId, {
//       role: "user",
//       content: input
//     });

//     // Create and monitor run
//     const run = await openai.beta.threads.runs.create(threadId, {
//       assistant_id: assistantId
//     });

//     let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
//     logger.info(`Initial run status: ${runStatus.status}`);

//     const startTime = Date.now();
//     const maxDuration = 480000; // 8 minutes (allowing buffer for 9-minute timeout)

//     while (Date.now() - startTime < maxDuration) {
//       switch (runStatus.status) {
//         case 'completed':
//           const messages = await openai.beta.threads.messages.list(threadId);
//           const lastMessage = messages.data[0];
//           return {
//             success: true,
//             response: lastMessage.content[0].text.value,
//             threadId: threadId
//           };

//         case 'failed':
//         case 'expired':
//           throw new Error(`Run ${runStatus.status}: ${JSON.stringify(runStatus.last_error)}`);

//         case 'requires_action':
//           await handleToolCalls(runStatus, threadId, run.id);
//           break;

//         default:
//           await new Promise(resolve => setTimeout(resolve, 1000));
//           break;
//       }

//       runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
//       logger.info(`Run status update: ${runStatus.status}`);
//     }

//     throw new Error('Run processing timeout exceeded');
//   } catch (error) {
//     logger.error('Error in processChat:', error);
//     throw error;
//   }
// }

// async function handleToolCalls(runStatus, threadId, runId) {
//   const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
//   const toolOutputs = [];

//   for (const toolCall of toolCalls) {
//     if (toolCall.function.name === "fetchBoeData") {
//       const data = await fetchBoeData();
//       toolOutputs.push({
//         tool_call_id: toolCall.id,
//         output: JSON.stringify(data)
//       });
//     }
//   }

//   if (toolOutputs.length > 0) {
//     await openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
//       tool_outputs: toolOutputs
//     });
//   }
// }

// exports.processBOEChatNew = functions.region('us-central1').
// 	runWith({
// 		timeoutSeconds: 540,
// 		memory: '2GB'
//   }).https.onCall(
//   (data, context) => {
// 		try {
//       logger.info('Received request data:', requestData);

//       const data = requestData.data || requestData;
//       const message = data.message;
//       const assistantId = data.assistantId;
//       const threadId = data.threadId;

//       if (!message || typeof message !== 'string') {
//         throw new functions.https.HttpsError(
//           'invalid-argument',
//           'Message is required and must be a string'
//         );
//       }

//       if (!assistantId || typeof assistantId !== 'string') {
//         throw new functions.https.HttpsError(
//           'invalid-argument',
//           'AssistantId is required and must be a string'
//         );
//       }

//       const cleanThreadId = threadId && threadId.trim() ? threadId : null;
      
//       // Set a timeout promise
//       const timeoutPromise = new Promise((_, reject) => {
//         setTimeout(() => {
//           reject(new Error('Operation timed out'));
//         }, 500000); // 500 seconds timeout
//       });

//       // Race between the actual process and timeout
//       const result = await Promise.race([
//         processChat(message, cleanThreadId, assistantId),
//         timeoutPromise
//       ]);

//       logger.info('Successfully processed request');
      
//       return {
//         success: true,
//         response: result.response,
//         threadId: result.threadId
//       };

//     } catch (error) {
//       logger.error('Error in cloud function:', error);

//       const errorResponse = {
//         success: false,
//         error: error.message || 'An unknown error occurred',
//         threadId: requestData?.data?.threadId || requestData?.threadId || null
//       };

//       if (error.message === 'Operation timed out') {
//         errorResponse.error = 'The request took too long to process. Please try again.';
//       }

//       throw new functions.https.HttpsError(
//         error.code || 'unknown',
//         errorResponse.error,
//         errorResponse
//       );
//     }
//   }
// );













// import OpenAI from "openai";
// import axios from "axios";
// import xml2js from "xml2js";
// import * as readline from "readline";

// const openai = new OpenAI({
//     apiKey: "",
// });

// // Logger utility
// const logger = {
//     info: (message, data = null) => {
//         const timestamp = new Date().toISOString();
//         console.log(`[${timestamp}] INFO: ${message}`);
//         if (data) console.log("Data:", JSON.stringify(data, null, 2));
//     },
//     error: (message, error = null) => {
//         const timestamp = new Date().toISOString();
//         console.error(`[${timestamp}] ERROR: ${message}`);
//         if (error) console.error("Error details:", error);
//     }
// };

// const BOE_API = {
//     BASE_URL: "https://www.boe.es/datosabiertos/api/legislacion-consolidada",
//     DOCUMENTS: {
//         IVA: {
//             id: "BOE-A-1992-28740",
//             name: "Ley del IVA",
//             description: "Ley del Impuesto sobre el Valor Añadido"
//         },
//         IRPF: {
//             id: "BOE-A-2006-20764",
//             name: "Ley del IRPF",
//             description: "Ley del Impuesto sobre la Renta de las Personas Físicas"
//         }
//     }
// };
// class TaxBot {
//     constructor() {
//         this.xmlParser = new xml2js.Parser({ explicitArray: false });
//         this.indexCache = new Map();
//         this.articleCache = new Map();
//     }

//     async fetchAndParseXML(url) {
//         try {
//             logger.info(`Fetching XML from: ${url}`);
//             const response = await axios.get(url, {
//                 headers: {
//                     Accept: "application/xml",
//                     "User-Agent": "TaxBot/1.0"
//                 },
//                 timeout: 10000 // 10 second timeout
//             });

//             if (response.status === 200) {
//                 return await this.xmlParser.parseStringPromise(response.data);
//             } else {
//                 throw new Error(`Unexpected status: ${response.status}`);
//             }
//         } catch (error) {
//             logger.error(`Error fetching XML from ${url}`, error);
//             if (error.response) {
//                 logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
//             }
//             throw error;
//         }
//     }


//     async getDocumentStructure(documentId) {
//         if (this.indexCache.has(documentId)) {
//             logger.info(`Using cached structure for document ${documentId}`);
//             return this.indexCache.get(documentId);
//         }

//         logger.info(`Fetching document structure for ${documentId}`);
//         const url = `${BOE_API.BASE_URL}/id/${documentId}/texto/indice`;

//         try {
//             const indexData = await this.fetchAndParseXML(url);
//             const processedStructure = this.processDocumentStructure(indexData);
//             this.indexCache.set(documentId, processedStructure);
//             return processedStructure;
//         } catch (error) {
//             logger.error(`Failed to get document structure for ${documentId}`, error);
//             throw new Error(`Unable to access tax legislation: ${error.message}`);
//         }
//     }

//     processDocumentStructure(indexData) {
//         const structure = {
//             articles: new Map(),
//             keywords: new Map()
//         };

//         const processNode = (node) => {
//             if (!node) return;

//             // Handle arrays of nodes
//             if (Array.isArray(node)) {
//                 node.forEach(n => processNode(n));
//                 return;
//             }

//             // Process precepto (article) nodes
//             if (node.$ && node.$.tipo === 'precepto') {
//                 const articleInfo = {
//                     id: node.$.id,
//                     title: node.$.titulo || '',
//                     type: node.$.tipo,
//                     keywords: this.extractKeywords(node.$.titulo || '')
//                 };

//                 structure.articles.set(articleInfo.id, articleInfo);

//                 // Index keywords
//                 articleInfo.keywords.forEach(keyword => {
//                     if (!structure.keywords.has(keyword)) {
//                         structure.keywords.set(keyword, new Set());
//                     }
//                     structure.keywords.get(keyword).add(articleInfo.id);
//                 });
//             }

//             // Recursively process child nodes
//             Object.keys(node).forEach(key => {
//                 if (typeof node[key] === 'object') {
//                     processNode(node[key]);
//                 }
//             });
//         };

//         processNode(indexData.response.data);
//         return structure;
//     }

//     async getArticleContent(documentId, articleId) {
//         const cacheKey = `${documentId}:${articleId}`;
//         if (this.articleCache.has(cacheKey)) {
//             return this.articleCache.get(cacheKey);
//         }

//         const url = `${BOE_API.BASE_URL}/id/${documentId}/texto/bloque/${articleId}`;
//         const articleData = await this.fetchAndParseXML(url);
//         const processedContent = this.processArticleContent(articleData);
//         this.articleCache.set(cacheKey, processedContent);
//         return processedContent;
//     }

//     processArticleContent(articleData) {
//         if (!articleData.bloque || !articleData.bloque.version) {
//             return null;
//         }

//         const versions = Array.isArray(articleData.bloque.version)
//             ? articleData.bloque.version
//             : [articleData.bloque.version];

//         // Get latest version
//         const latestVersion = versions.reduce((latest, current) => {
//             return !latest || current.$.fecha_vigencia > latest.$.fecha_vigencia
//                 ? current
//                 : latest;
//         }, versions[0]);

//         return {
//             title: articleData.bloque.$.titulo,
//             content: this.extractTextContent(latestVersion),
//             vigencia: latestVersion.$.fecha_vigencia
//         };
//     }

//     extractTextContent(node) {
//         if (!node) return '';
//         if (typeof node === 'string') return node;

//         let text = '';
//         const processNode = (n) => {
//             if (typeof n === 'string') {
//                 text += n + ' ';
//             } else if (n && typeof n === 'object') {
//                 if (n._) text += n._ + ' ';
//                 Object.keys(n).forEach(key => {
//                     if (key !== '$' && key !== '_') {
//                         if (Array.isArray(n[key])) {
//                             n[key].forEach(item => processNode(item));
//                         } else {
//                             processNode(n[key]);
//                         }
//                     }
//                 });
//             }
//         };

//         processNode(node);
//         return text.replace(/\s+/g, ' ').trim();
//     }

//     extractKeywords(text) {
//         const keywords = new Set();
//         const taxTerms = [
//             'iva', 'irpf', 'impuesto', 'tributación', 'autónomo',
//             'factura', 'declaración', 'deducción', 'base imponible',
//             'cuota', 'tributo', 'gravamen', 'actividad económica'
//         ];

//         const words = text.toLowerCase().split(/\W+/);
//         words.forEach(word => {
//             if (taxTerms.includes(word)) keywords.add(word);
//         });

//         return Array.from(keywords);
//     }

//     async findRelevantArticles(query, documentId) {
//         const structure = await this.getDocumentStructure(documentId);
//         const queryTerms = this.extractKeywords(query);
//         const relevantArticles = new Map();

//         // Score articles based on keyword matches
//         for (const term of queryTerms) {
//             const matchingKeywords = Array.from(structure.keywords.keys())
//                 .filter(keyword => keyword.includes(term));

//             for (const keyword of matchingKeywords) {
//                 const articleIds = structure.keywords.get(keyword);
//                 for (const articleId of articleIds) {
//                     const currentScore = relevantArticles.get(articleId) || 0;
//                     relevantArticles.set(articleId, currentScore + 1);
//                 }
//             }
//         }

//         // Get top matching articles with content
//         const topArticles = await Promise.all(
//             Array.from(relevantArticles.entries())
//                 .sort((a, b) => b[1] - a[1])
//                 .slice(0, 3)
//                 .map(async ([articleId]) => {
//                     const content = await this.getArticleContent(documentId, articleId);
//                     return {
//                         id: articleId,
//                         ...content,
//                         score: relevantArticles.get(articleId)
//                     };
//                 })
//         );

//         return topArticles;
//     }

//     async createAssistant() {
//         try {
//             const assistant = await openai.beta.assistants.create({
//                 name: "Taxbot ALPHA",
//                 instructions: `
//                     You are a Spanish tax consultant specializing in self-employed (autónomo) taxation.
//                     Focus on either IVA (VAT) or IRPF (Income Tax) based on the query context.
                    
//                     When responding:
//                     1. Use only the provided legal articles
//                     2. Always cite specific articles and sections
//                     3. Explain concepts in simple terms
//                     4. Include practical examples where possible
//                     5. Note any relevant deadlines or requirements
                    
//                     Structure your responses as:
//                     1. Legal Reference: Article citations
//                     2. Simple Explanation: Plain language explanation
//                     3. Practical Example: When applicable
//                     4. Additional Notes: Important deadlines/requirements
//                 `,
//                 model: "gpt-4o-mini",
//                 tools: [{
//                     type: "function",
//                     function: {
//                         name: "findRelevantArticles",
//                         description: "Finds relevant articles in tax legislation",
//                         parameters: {
//                             type: "object",
//                             properties: {
//                                 query: {
//                                     type: "string",
//                                     description: "The tax-related query"
//                                 },
//                                 documentId: {
//                                     type: "string",
//                                     description: "The tax document ID"
//                                 }
//                             },
//                             required: ["query", "documentId"]
//                         }
//                     }
//                 }]
//             });

//             return assistant.id;
//         } catch (error) {
//             logger.error("Error creating assistant", error);
//             throw error;
//         }
//     }

//     async processQuery(query, documentId, threadId = null) {
//         try {
//             const assistantId = await this.createAssistant();

//             if (!threadId) {
//                 const thread = await openai.beta.threads.create();
//                 threadId = thread.id;
//             }

//             // Add user message
//             await openai.beta.threads.messages.create(threadId, {
//                 role: "user",
//                 content: query
//             });

//             // Create and monitor run
//             const run = await openai.beta.threads.runs.create(threadId, {
//                 assistant_id: assistantId
//             });

//             let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);

//             while (runStatus.status !== "completed") {
//                 if (runStatus.status === "requires_action") {
//                     await this.handleToolCalls(runStatus, threadId, run.id);
//                 }
//                 await new Promise(resolve => setTimeout(resolve, 1000));
//                 runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
//             }

//             const messages = await openai.beta.threads.messages.list(threadId);
//             return {
//                 response: messages.data[0].content[0].text.value,
//                 threadId
//             };
//         } catch (error) {
//             logger.error("Error processing query", error);
//             throw error;
//         }
//     }

//     async handleToolCalls(runStatus, threadId, runId) {
//         const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
//         const toolOutputs = [];

//         for (const toolCall of toolCalls) {
//             if (toolCall.function.name === "findRelevantArticles") {
//                 const args = JSON.parse(toolCall.function.arguments);
//                 const articles = await this.findRelevantArticles(
//                     args.query,
//                     args.documentId
//                 );
//                 toolOutputs.push({
//                     tool_call_id: toolCall.id,
//                     output: JSON.stringify(articles)
//                 });
//             }
//         }

//         if (toolOutputs.length > 0) {
//             await openai.beta.threads.runs.submitToolOutputs(
//                 threadId,
//                 runId,
//                 { tool_outputs: toolOutputs }
//             );
//         }
//     }
// }

// // Main function
// async function main() {
//     logger.info("Starting Tax Consultation Assistant");
//     const taxBot = new TaxBot();
//     let currentThread = null;

//     const rl = readline.createInterface({
//         input: process.stdin,
//         output: process.stdout
//     });

//     console.log("\nWelcome to the Spanish Tax Consultation Assistant!");
//     console.log("Type 'exit' to quit, or select consultation type:");
//     console.log("1. IVA (VAT)");
//     console.log("2. IRPF (Income Tax)\n");

//     let documentId = null;

//     const askConsultationType = () => {
//         return new Promise((resolve) => {
//             rl.question("Select type (1 or 2): ", (answer) => {
//                 if (answer === '1') {
//                     documentId = BOE_API.DOCUMENTS.IVA.id;  // Use the full BOE document ID
//                     console.log("\nIVA consultation selected. Ask your question!\n");
//                     resolve();
//                 } else if (answer === '2') {
//                     documentId = BOE_API.DOCUMENTS.IRPF.id;  // Use the full BOE document ID
//                     console.log("\nIRPF consultation selected. Ask your question!\n");
//                     resolve();
//                 } else {
//                     console.log("\nInvalid selection. Please choose 1 or 2.\n");
//                     askConsultationType().then(resolve);
//                 }
//             });
//         });
//     };

//     const askQuestion = () => {
//         rl.question("You: ", async (input) => {
//             if (input.toLowerCase() === "exit") {
//                 rl.close();
//                 return;
//             }

//             try {
//                 logger.info(`Processing query with document ID: ${documentId}`);
//                 const { response, threadId } = await taxBot.processQuery(
//                     input,
//                     documentId,
//                     currentThread
//                 );
//                 currentThread = threadId;
//                 console.log("\nAssistant:", response, "\n");
//             } catch (error) {
//                 logger.error("Error processing query", error);
//                 console.log("\nAssistant: Lo siento, hubo un error procesando su consulta.\n");
//             }
//             askQuestion();
//         });
//     };

//     await askConsultationType();
//     askQuestion();
// }

// main().catch(error => {
//     logger.error("Fatal error", error);
//     process.exit(1);
// });