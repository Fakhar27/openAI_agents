// // setup.js
// import OpenAI from 'openai';
// import readline from 'readline';
// import axios from 'axios';
// import { fileURLToPath } from 'url';
// import path from 'path';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // Initialize OpenAI client
// const openai = new OpenAI({
//     apiKey: process.env.OPENAI_API_KEY
// });

// // Logger utility
// const logger = {
//     info: (message, data = null) => {
//         const timestamp = new Date().toISOString();
//         console.log(`[${timestamp}] INFO: ${message}`);
//         if (data) {
//             console.log('Data:', JSON.stringify(data, null, 2));
//         }
//     },
//     error: (message, error = null) => {
//         const timestamp = new Date().toISOString();
//         console.error(`[${timestamp}] ERROR: ${message}`);
//         if (error) {
//             console.error('Error details:', error);
//         }
//     }
// };

// async function getValidBoeDate() {
//     const today = new Date();

//     // If it's Sunday, return Saturday's date
//     if (today.getDay() === 0) {
//         const yesterday = new Date(today);
//         yesterday.setDate(today.getDate() - 1);
//         return yesterday.toISOString().split('T')[0].replace(/-/g, '');
//     }

//     return today.toISOString().split('T')[0].replace(/-/g, '');
// }

// async function fetchBoeData(dateStr = null) {
//     const targetDate = dateStr || await getValidBoeDate();
//     logger.info(`Attempting to fetch BOE data for date: ${targetDate}`);

//     try {
//         const url = `https://www.boe.es/datosabiertos/api/boe/sumario/${targetDate}`;
//         logger.info(`Making request to BOE API: ${url}`);

//         const response = await axios.get(url, {
//             headers: {
//                 "Accept": "application/json",
//                 "Content-Type": "application/json"
//             },
//             timeout: 10000
//         });

//         if (response.status === 200 && response.data) {
//             // Format the date properly
//             const formattedDate = new Date(targetDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'))
//                 .toLocaleDateString('en-US', { 
//                     year: 'numeric', 
//                     month: 'long', 
//                     day: 'numeric' 
//                 });

//             // Add formatted date and metadata to response
//             response.data.metadata = {
//                 publishDate: formattedDate,
//                 dateStr: targetDate
//             };

//             logger.info(`Successfully retrieved BOE data for ${targetDate}`);
//             return response.data;
//         }

//         if (response.status === 404) {
//             logger.warn(`No data found for ${targetDate}, trying previous working day`);
//             const previousDate = new Date(targetDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
//             previousDate.setDate(previousDate.getDate() - 1);
//             if (previousDate.getDay() === 0) {
//                 previousDate.setDate(previousDate.getDate() - 1);
//             }
//             const previousDateStr = previousDate.toISOString().split('T')[0].replace(/-/g, '');
//             return await fetchBoeData(previousDateStr);
//         }

//         logger.error(`Failed to fetch BOE data`);
//         throw new Error(`BOE API returned status ${response.status}`);
//     } catch (error) {
//         logger.error(`Error fetching BOE data`, error);
//         throw error;
//     }
// }

// // Update the assistant instructions to include information about date handling
// async function createAssistant() {
//     logger.info('Starting assistant creation/retrieval process');

//     try {
//         const assistants = await openai.beta.assistants.list({
//             order: "desc",
//             limit: 100
//         });

//         const existingAssistant = assistants.data.find(
//             assistant => assistant.name === "Spanish BOE Assistant BETA"
//         );

//         if (existingAssistant) {
//             logger.info(`Found existing assistant with ID: ${existingAssistant.id}`);
//             return existingAssistant.id;
//         }

//         logger.info('Creating new assistant...');
//         const assistant = await openai.beta.assistants.create({
//             name: "Spanish BOE Assistant BETA",
//             // instructions: `
//             // You are an expert legal consultation assistant specializing in analyzing Spanish laws and regulations.

//             // RESPONSE BEHAVIOR:
//             // 1. FOR BOE-RELATED QUERIES:
//             // - Start with "BOE Publication Date: [date from API]"
//             // - Provide extensive, detailed analysis
//             // - Structure as follows:

//             // 📌 KEY UPDATES
//             // • List major changes and announcements
//             // • Highlight time-sensitive items

//             // 📑 DETAILED ANALYSIS
//             // • Break down significant changes
//             // • Explain legal context and implications
//             // • Compare with previous legislation

//             // 🔍 IMPACT ANALYSIS
//             // • Effects on different stakeholders
//             // • Implementation requirements
//             // • Important deadlines

//             // 📚 OFFICIAL DOCUMENTS
//             // List each important document in this format:

//             // Document: [Title]
//             // Type: [Law/Resolution/etc.]
//             // Reference: BOE-X-YYYY-NNNNN
//             // Access: https://www.boe.es/...

//             // 2. FOR NON-BOE QUERIES:
//             // - Provide brief, concise answers
//             // - Focus on key facts only
//             // - Avoid lengthy explanations
//             // - Keep responses under 5 main points

//             // IMPORTANT RULES:
//             // - For BOE analysis: be comprehensive, detailed, analytical
//             // - For general questions: be brief and direct
//             // - Always verify BOE date from API response
//             // - Present document links in clean, separate sections
//             // - Focus on practical implications
//             // - Explain technical terms when used

//             // Remember: Detailed analysis for BOE, concise answers for everything else.`,
//             instructions: `
//                  You are an expert legal consultation assistant specializing in analyzing Spanish laws and regulations.
//                  Your primary responsibilities:

//                  1. Always work with TODAY'S BOE data only - verify the date in the API response
//                  2. Begin each response by stating the BOE publication date you're analyzing
//                  3. Provide comprehensive analysis of the BOE content:
//                     - Summarize key legislative changes
//                     - Highlight important announcements
//                     - Explain practical implications
//                  4. Structure your responses clearly:
//                     - Date and reference
//                     - Summary of key points
//                     - Detailed analysis
//                     - Practical implications
//                  5. Use your knowledge to provide context and explain technical terms
//                  6. If no BOE data is available for today, explicitly state this

//                  Remember: Quality and accuracy are paramount. Always verify you're working
//                  with current data and provide detailed, well-structured responses.
//              `,
//             model: "gpt-4o-mini",
//             tools: [{
//                 type: "function",
//                 function: {
//                     name: "fetchBoeData",
//                     description: "Fetches BOE data, handling weekends and unavailable dates automatically",
//                     parameters: {
//                         type: "object",
//                         properties: {
//                             date: {
//                                 type: "string",
//                                 description: "Date in YYYYMMDD format. If not provided or if it's Sunday, will use appropriate fallback date."
//                             }
//                         },
//                         required: ["date"],
//                         additionalProperties: false
//                     },
//                     strict: true
//                 }
//             }]
//         });

//         logger.info(`Created new assistant with ID: ${assistant.id}`);
//         return assistant.id;
//     } catch (error) {
//         logger.error('Error in createAssistant:', error);
//         throw error;
//     }
// }

// // Process chat messages
// async function processChat(input, threadId, assistantId) {
//     logger.info(`Processing chat input: "${input}"`);
//     logger.info(`Thread ID: ${threadId}, Assistant ID: ${assistantId}`);

//     try {
//         if (!threadId) {
//             const thread = await openai.beta.threads.create();
//             threadId = thread.id;
//             logger.info(`Created new thread with ID: ${threadId}`);
//         }

//         // Create message with clear context
//         await openai.beta.threads.messages.create(threadId, {
//             role: "user",
//             content: input
//         });

//         // Create and monitor run
//         const run = await openai.beta.threads.runs.create(threadId, {
//             assistant_id: assistantId,
//             instructions: "Provide detailed and comprehensive responses. For BOE queries, include all relevant information and structure it clearly."
//         });

//         // Enhanced run status handling
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
//                                 output: JSON.stringify(data)
//                             });
//                         } catch (error) {
//                             logger.error('Error in fetchBoeData:', error);
//                             toolOutputs.push({
//                                 tool_call_id: toolCall.id,
//                                 output: JSON.stringify({ error: "Failed to fetch BOE data" })
//                             });
//                         }
//                     }
//                 }

//                 await openai.beta.threads.runs.submitToolOutputs(
//                     threadId,
//                     run.id,
//                     { tool_outputs: toolOutputs }
//                 );
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

// // Main function to run the chat interface
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
//             rl.question('You: ', async (input) => {
//                 if (input.toLowerCase() === 'exit') {
//                     logger.info('User requested exit');
//                     rl.close();
//                     return;
//                 }

//                 try {
//                     const { response, threadId } = await processChat(input, currentThreadId, assistantId);
//                     currentThreadId = threadId;
//                     console.log('\nAssistant:', response, '\n');
//                 } catch (error) {
//                     logger.error('Error processing message:', error);
//                     console.log('\nError:', error.message, '\n');
//                 }

//                 askQuestion();
//             });
//         };

//         console.log('Chat started. Type "exit" to quit.\n');
//         askQuestion();
//     } catch (error) {
//         logger.error('Error in main:', error);
//         process.exit(1);
//     }
// }

// // Start the application
// main().catch(error => {
//     logger.error('Unhandled error in application:', error);
//     process.exit(1);
// });

























// // Import necessary libraries
// import axios from 'axios';
// import readline from 'readline';
// import openai from 'openai';

// // Set your OpenAI API key
// openai.apiKey = 'your-openai-api-key';

// // Define the function to fetch and process BOE data
// async function fetchBoeData(query) {
//   try {
//     // Get today's date in the required format (YYYYMMDD)
//     const todayDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
//     const url = `https://www.boe.es/datosabiertos/api/boe/sumario/${todayDate}`;
//     const headers = {
//       Accept: 'application/json',
//     };
//     // Make the GET request to the BOE API
//     const response = await axios.get(url, { headers });
//     if (response.status === 200) {
//       const data = response.data;
//       // Process the JSON data to extract relevant information based on the query
//       const relevantInfo = processBoeJson(data, query);
//       return relevantInfo;
//     } else {
//       return 'No data available from the BOE API at this time.';
//     }
//   } catch (error) {
//     console.error('Error fetching BOE data:', error);
//     return 'An error occurred while fetching data from the BOE API.';
//   }
// }

// // Define a function to process the BOE JSON data
// function processBoeJson(data, query) {
//   // Example implementation:
//   const relevantEntries = [];
//   if (data && data.boletin && data.boletin.sumario && data.boletin.sumario.secciones) {
//     const sections = data.boletin.sumario.secciones;
//     sections.forEach((section) => {
//       if (section && section.seccion && section.seccion.contenido) {
//         const contents = section.seccion.contenido;
//         contents.forEach((content) => {
//           if (content && content.item) {
//             const items = content.item;
//             items.forEach((item) => {
//               const title = item.titulo ? item.titulo._text || '' : '';
//               const summary = item.sumario ? item.sumario._text || '' : '';
//               if (
//                 title.toLowerCase().includes(query.toLowerCase()) ||
//                 summary.toLowerCase().includes(query.toLowerCase())
//               ) {
//                 relevantEntries.push({
//                   title,
//                   summary,
//                   url: item.urlPdf ? item.urlPdf._text || '' : '',
//                 });
//               }
//             });
//           }
//         });
//       }
//     });
//   }
//   if (relevantEntries.length > 0) {
//     let response = 'I found the following relevant information in the BOE:\n\n';
//     relevantEntries.forEach((entry) => {
//       response += `- **Title:** ${entry.title}\n  **Summary:** ${entry.summary}\n  **URL:** ${entry.url}\n\n`;
//     });
//     return response;
//   } else {
//     return 'I could not find relevant information in the latest BOE data.';
//   }
// }

// // Define the function schema for OpenAI
// const functions = [
//   {
//     name: 'fetchBoeData',
//     description:
//       'Fetches and processes BOE data to provide legal information based on the user’s query.',
//     parameters: {
//       type: 'object',
//       properties: {
//         query: {
//           type: 'string',
//           description: 'The user’s legal question or topic to search in BOE data.',
//         },
//       },
//       required: ['query'],
//     },
//   },
// ];

// // Define the assistant's system prompt
// const systemPrompt = `
// You are an expert legal consultation assistant specializing in Spanish laws and regulations for self-employed workers and companies.

// - Use the \`fetchBoeData\` function to obtain the latest BOE data relevant to the user’s question.
// - Interpret the user’s question to identify key topics and context.
// - Provide clear, concise answers supported by the most recent laws and regulations.
// - Cite specific BOE publications, sections, and quotes when relevant.
// - If you cannot find the information, inform the user politely and suggest consulting a legal professional.
// `;

// // Implement the conversation loop with function calling
// async function chatWithAssistant() {
//   const conversationHistory = [
//     { role: 'system', content: systemPrompt },
//   ];

//   const rl = readline.createInterface({
//     input: process.stdin,
//     output: process.stdout,
//   });

//   console.log('Assistant started. Type "exit" to quit.\n');

//   const askQuestion = () => {
//     rl.question('You: ', async (userInput) => {
//       if (userInput.toLowerCase() === 'exit') {
//         rl.close();
//         return;
//       }

//       conversationHistory.push({ role: 'user', content: userInput });

//       try {
//         const response = await openai.Chat.completions.create({
//           messages: conversationHistory,
//           model: 'gpt-3.5-turbo-0613', // Use the appropriate model with function calling capability
//           functions: functions,
//           function_call: 'auto', // Let the assistant decide to use the function
//         });

//         const message = response.choices[0].message;

//         if (message.function_call) {
//           // The assistant wants to call a function
//           const functionName = message.function_call.name;
//           const functionArgs = JSON.parse(message.function_call.arguments);

//           if (functionName === 'fetchBoeData') {
//             const functionResponse = await fetchBoeData(functionArgs.query);

//             // Add the function's response to the conversation
//             conversationHistory.push({
//               role: 'function',
//               name: functionName,
//               content: functionResponse,
//             });

//             // Get the assistant's final answer using the function's output
//             const secondResponse = await openai.Chat.completions.create({
//               messages: conversationHistory,
//               model: 'gpt-3.5-turbo-0613',
//             });

//             const assistantReply = secondResponse.choices[0].message.content;

//             conversationHistory.push({ role: 'assistant', content: assistantReply });
//             console.log(`\nAssistant: ${assistantReply}\n`);
//           } else {
//             const assistantReply = "Sorry, I can't process that request.";
//             conversationHistory.push({ role: 'assistant', content: assistantReply });
//             console.log(`\nAssistant: ${assistantReply}\n`);
//           }
//         } else {
//           const assistantReply = message.content;
//           conversationHistory.push({ role: 'assistant', content: assistantReply });
//           console.log(`\nAssistant: ${assistantReply}\n`);
//         }
//       } catch (error) {
//         console.error('Error processing the message:', error);
//         const assistantReply =
//           'There was an error processing your request. Please try again later.';
//         conversationHistory.push({ role: 'assistant', content: assistantReply });
//         console.log(`\nAssistant: ${assistantReply}\n`);
//       }

//       askQuestion();
//     });
//   };

//   askQuestion();
// }

// // Start the assistant
// chatWithAssistant();











// **************************************************  THIS CODE WORKS ***********************************************
// import OpenAI from 'openai';
// import axios from 'axios';
// import fs from 'fs';
// import path from 'path';
// import { fileURLToPath } from 'url';
// import * as readline from 'readline';
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
// const openai = new OpenAI({
//     apiKey: process.env.OPENAI_API_KEY
// });
// async function processChat(input, threadId, assistantId) {
//     try {
//         if (!threadId) {
//             const thread = await openai.beta.threads.create();
//             threadId = thread.id;
//         }
//         await openai.beta.threads.messages.create(threadId, {
//             role: "user",
//             content: input
//         });
//         const run = await openai.beta.threads.runs.create(threadId, {
//             assistant_id: assistantId
//         });
//         let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
//         while (runStatus.status !== "completed") {
//             if (runStatus.status === "failed") {
//                 throw new Error("Run failed");
//             }
//             await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
//             runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
//         }
//         const messages = await openai.beta.threads.messages.list(threadId);
//         const lastMessage = messages.data[0];
//         return {
//             response: lastMessage.content[0].text.value,
//             threadId: threadId
//         };
//     } catch (error) {
//         console.error('Error in processChat:', error);
//         throw error;
//     }
// }
// const calculateUid = (year, month, day) => {
//     const startingUids = {
//         1: 1, 2: 28, 3: 54, 4: 80, 5: 106,
//         6: 133, 7: 158, 8: 185, 9: 212, 10: 237
//     };
//     const startUid = startingUids[month];
//     if (!startUid) {
//         throw new Error(`Starting UID not defined for month ${month}`);
//     }
//     let dayOffset = 0;
//     for (let d = 1; d < day; d++) {
//         const date = new Date(year, month - 1, d);
//         if (date.getDay() !== 0) { // 0 is Sunday
//             dayOffset++;
//         }
//     }
//     return startUid + dayOffset;
// };
// async function downloadBoePdf(year, month, day) {
//     try {
//         const uid = calculateUid(year, month, day);
//         const url = `https://www.boe.es/boe/dias/${year}/${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/pdfs/BOE-S-${year}-${uid}.pdf`;

//         console.log(`Downloading PDF from: ${url}`);

//         const response = await axios.get(url, {
//             responseType: 'arraybuffer'
//         });

//         if (response.status === 200) {
//             console.log(`Successfully downloaded BOE PDF for ${year}-${month}-${day}`);
//             return response.data;
//         }
//         console.warn(`Failed to download PDF. Status code: ${response.status}`);
//         return null;
//     } catch (error) {
//         console.error('Error downloading BOE PDF:', error);
//         return null;
//     }
// }
// async function fetchAndUpdateVectorStore(vectorStoreId = null) {
//     const today = new Date(2024, 9, 31);
//     if (today.getDay() === 0) {
//         console.log("Today is Sunday. No publication available.");
//         return { success: false, vectorStoreId };
//     }
//     const todayFilename = `BOE-S-${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}.pdf`;
//     try {
//         if (!vectorStoreId) {
//             const vectorStores = await openai.beta.vectorStores.list();
//             const existingStore = vectorStores.data.find(store =>
//                 store.name.startsWith('Tax_Documents_')
//             );
//             if (existingStore) {
//                 console.log('Found existing vector store');
//                 vectorStoreId = existingStore.id;
//             } else {
//                 console.log('Creating new vector store...');
//                 const vectorStore = await openai.beta.vectorStores.create({
//                     name: `Tax_Documents_${today.toISOString().replace(/[:.]/g, '_')}`,
//                     expires_after: {
//                         anchor: "last_active_at",
//                         days: 7
//                     }
//                 });
//                 vectorStoreId = vectorStore.id;
//                 console.log(`Created new vector store with ID: ${vectorStoreId}`);
//             }
//         }
//         const filesList = await openai.files.list();
//         const existingFile = filesList.data.find(f => f.filename === todayFilename);
//         if (existingFile) {
//             console.log(`File ${todayFilename} already exists in OpenAI storage.`);
//             try {
//                 await openai.beta.vectorStores.files.createAndPoll(
//                     vectorStoreId,
//                     { file_id: existingFile.id }
//                 );
//             } catch (error) {
//                 console.log('File might already be in vector store');
//             }
//             return { success: true, vectorStoreId };
//         }
//         const pdfContent = await downloadBoePdf(
//             today.getFullYear(),
//             today.getMonth() + 1,
//             today.getDate()
//         );

//         if (!pdfContent) {
//             console.error("Failed to download the PDF. Aborting update.");
//             return { success: false, vectorStoreId };
//         }
//         const tempFilePath = path.join(__dirname, todayFilename);
//         fs.writeFileSync(tempFilePath, pdfContent);
//         const file = await openai.files.create({
//             file: fs.createReadStream(tempFilePath),
//             purpose: 'assistants'
//         });
//         await openai.beta.vectorStores.files.createAndPoll(
//             vectorStoreId,
//             { file_id: file.id }
//         );
//         fs.unlinkSync(tempFilePath);
//         return { success: true, vectorStoreId };
//     } catch (error) {
//         console.error('Error in fetchAndUpdateVectorStore:', error);
//         return { success: false, vectorStoreId };
//     }
// }
// async function createAssistant(vectorStoreId) {
//     try {
//         const assistants = await openai.beta.assistants.list({
//             order: "desc",
//             limit: 100
//         });
//         const existingAssistant = assistants.data.find(
//             assistant => assistant.name === "BOE Document Analysis Assistant"
//         );

//         if (existingAssistant) {
//             console.log('Found existing assistant, updating with current vector store...');
//             const updatedAssistant = await openai.beta.assistants.update(
//                 existingAssistant.id,
//                 {
//                     tool_resources: {
//                         file_search: {
//                             vector_store_ids: vectorStoreId ? [vectorStoreId] : []
//                         },
//                     }
//                 }
//             );
//             console.log(`Using existing assistant with ID: ${updatedAssistant.id}`);
//             return updatedAssistant.id;
//         }
//         console.log('Creating new assistant...');
//         const assistant = await openai.beta.assistants.create({
//             name: "BOE Document Analysis Assistant",
//             instructions: `
//                 You are an expert legal consultation assistant specializing in analyzing Spanish laws and regulations to provide up-to-date information for self-employed workers and companies in Spain. Follow these guidelines:
//                 1. Your primary data sources are the latest DISPOSICIONES GENERALES (LEYES and REALES DECRETOS) published in the Boletín Oficial del Estado (BOE). Always check these documents first before responding.
//                 2. Interpret the users question to identify the key topics and context. Use this to guide your search of the relevant laws and regulations. 
//                 3. Systematically search the BOE documents for sections relevant to the users question. Cite the specific BOE publication name, section, and quote when you find pertinent information.
//                 4. Trace the history of laws and regulations to find the most up-to-date information. Note any modifications or derogations of earlier policies in your response.
//                 5. If you do not find relevant information in the BOE documents, expand your search to other reputable legal sources. Clearly state what sources you consulted.
//                 6. Synthesize the information from the laws and regulations into a clear, concise answer to the users specific question. Provide actionable advice while disclaiming that it is informational only and not personal legal advice.
//                 7. If the users question cannot be satisfactorily answered by the information in the knowledge base, state that clearly and politely suggest alternative sources or speaking with a legal professional.
//                 Remember: Your goal is to provide the most accurate, current and relevant information to support self-employed workers and companies in complying with Spanish legal requirements. Rely heavily on the BOE documents and quote them in your responses.
//             `,
//             model: "gpt-4o-mini",
//             tools: [{ type: "file_search" }],
//             tool_resources: {
//                 file_search: {
//                     vector_store_ids: vectorStoreId ? [vectorStoreId] : []
//                 },
//             },
//         });
//         console.log(`Created new assistant with ID: ${assistant.id}`);
//         return assistant.id;
//     } catch (error) {
//         console.error('Error in getOrCreateAssistant:', error);
//         throw error;
//     }
// }
// async function main() {
//     try {
//         console.log('Initializing BOE Assistant...');
//         const { success, vectorStoreId } = await fetchAndUpdateVectorStore();
//         if (!success) {
//             throw new Error('Failed to initialize vector store');
//         }
//         const assistantId = await createAssistant(vectorStoreId);
//         console.log('\nInitialization complete!');
//         console.log(`Vector Store ID: ${vectorStoreId}`);
//         console.log(`Assistant ID: ${assistantId}\n`);
//         const rl = readline.createInterface({
//             input: process.stdin,
//             output: process.stdout
//         });
//         let currentThreadId = null;
//         console.log('Chat started. Type "exit" to quit.\n');
//         const askQuestion = () => {
//             rl.question('You: ', async (input) => {
//                 if (input.toLowerCase() === 'exit') {
//                     rl.close();
//                     return;
//                 }
//                 try {
//                     const { response, threadId } = await processChat(input, currentThreadId, assistantId);
//                     currentThreadId = threadId;
//                     console.log('\nAssistant:', response, '\n');
//                 } catch (error) {
//                     console.error('Error processing message:', error);
//                 }
//                 askQuestion();
//             });
//         };
//         askQuestion();
//     } catch (error) {
//         console.error('Error in main:', error);
//         process.exit(1);
//     }
// }
// main().catch(console.error);














// testBoeAssistant.js
// import OpenAI from 'openai';
// import axios from 'axios';
// import * as fs from 'fs/promises';  // Changed this import
// import { createReadStream } from 'node:fs';  // Added explicit node:fs import
// import dotenv from 'dotenv';
// import FormData from 'form-data';
// import { Readable } from 'stream';
// import readline from 'readline';

// // Load environment variables
// dotenv.config();

// const openai = new OpenAI({
//     apiKey: process.env.OPENAI_API_KEY
// });

// // Utility function to calculate UID for BOE PDF
// const calculateUid = (year, month, day) => {
//     const startingUids = {
//         1: 1, 2: 28, 3: 54, 4: 80, 5: 106,
//         6: 133, 7: 158, 8: 185, 9: 212, 10: 237
//     };

//     const startUid = startingUids[month];
//     if (!startUid) {
//         throw new Error(`Starting UID not defined for month ${month}`);
//     }

//     let dayOffset = 0;
//     for (let d = 1; d < day; d++) {
//         const date = new Date(year, month - 1, d);
//         if (date.getDay() !== 0) { // 0 is Sunday
//             dayOffset++;
//         }
//     }

//     return startUid + dayOffset;
// };

// // Function to download BOE PDF
// async function downloadBoePdf(year, month, day) {
//     try {
//         const uid = calculateUid(year, month, day);
//         const url = `https://www.boe.es/boe/dias/${year}/${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/pdfs/BOE-S-${year}-${uid}.pdf`;

//         console.log(`Downloading PDF from: ${url}`);

//         const response = await axios.get(url, {
//             responseType: 'arraybuffer'
//         });

//         if (response.status === 200) {
//             console.log(`Successfully downloaded BOE PDF for ${year}-${month}-${day}`);
//             return response.data;
//         }
//         console.warn(`Failed to download PDF. Status code: ${response.status}`);
//         return null;
//     } catch (error) {
//         console.error('Error downloading BOE PDF:', error);
//         return null;
//     }
// }

// // const today = new Date(2024, 9, 31);

// //     // Check if today is Sunday
// //     if (today.getDay() === 0) {
// //         console.log("Today is Sunday. No publication available.");
// //         return { success: false, vectorStoreId };
// //     }

// //     const todayFilename = `BOE-S-${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}.pdf`;
// //     // This will generate: BOE-S-2024-10-31.pdf

// // Function to check and update vector store with latest BOE
// async function fetchAndUpdateVectorStore(vectorStoreId = null) {
//     // const today = new Date();

//     // // Check if today is Sunday (0 is Sunday in JavaScript)
//     // if (today.getDay() === 0) {
//     //     console.log("Today is Sunday. No publication available.");
//     //     return { success: false, vectorStoreId };
//     // }

//     // const todayFilename = `BOE-S-${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}.pdf`;
//     const today = new Date(2024, 9, 31);

//     // Check if today is Sunday
//     if (today.getDay() === 0) {
//         console.log("Today is Sunday. No publication available.");
//         return { success: false, vectorStoreId };
//     }

//     const todayFilename = `BOE-S-${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}.pdf`;
//     // This will generate: BOE-S-2024-10-31.pdf

//     try {
//         // Check if file already exists
//         const filesList = await openai.files.list();
//         const existingFile = filesList.data.find(f => f.filename === todayFilename);

//         if (existingFile) {
//             console.log(`File ${todayFilename} already exists in OpenAI storage.`);
//             return { success: true, vectorStoreId };
//         }

//         // Download PDF content
//         const pdfContent = await downloadBoePdf(
//             today.getFullYear(),
//             today.getMonth() + 1,
//             today.getDate()
//         );

//         if (!pdfContent) {
//             console.error("Failed to download the PDF. Aborting update.");
//             return { success: false, vectorStoreId };
//         }

//         // Write the PDF content to a temporary file
//         const tempFilePath = `./${todayFilename}`;
//         await fs.writeFile(tempFilePath, pdfContent);

//         // Create file stream
//         const fileStream = fs.createReadStream(tempFilePath);

//         // Create file in OpenAI
//         const file = await openai.files.create({
//             file: fileStream,
//             purpose: 'assistants'
//         });

//         // Create or update vector store
//         if (!vectorStoreId) {
//             console.log('Creating new vector store...');
//             const vectorStore = await openai.beta.vectorStores.create({
//                 name: `Tax_Documents_${today.toISOString().replace(/[:.]/g, '_')}`,
//                 file_ids: [file.id],
//                 expires_after: {
//                     anchor: "last_active_at",
//                     days: 1
//                 }
//             });
//             vectorStoreId = vectorStore.id;
//             console.log(`Created new vector store with ID: ${vectorStoreId}`);
//         } else {
//             console.log('Adding file to existing vector store...');
//             await openai.beta.vectorStores.files.createAndPoll(
//                 vectorStoreId,
//                 { file_id: file.id }
//             );
//         }

//         // Clean up temporary file
//         await fs.unlink(tempFilePath);

//         return { success: true, vectorStoreId };

//     } catch (error) {
//         console.error('Error in fetchAndUpdateVectorStore:', error);
//         return { success: false, vectorStoreId };
//     }
// }

// // Function to create assistant
// async function createAssistant(vectorStoreId) {
//     try {
//         const assistant = await openai.beta.assistants.create({
//             name: "BOE Document Analysis Assistant",
//             instructions: `
//                 You are an expert assistant specialized in analyzing and providing information from the provided documents. Follow these guidelines:
//                 1. ALWAYS check the provided documents first before responding
//                 2. If you find relevant information in the documents, cite it specifically
//                 3. If you don't find relevant information in the documents, clearly state that
//                 4. When summarizing documents, go through each one systematically
//                 5. Reference specific document names when possible (e.g., "In BOE-S-2024-XX-XX.pdf, I found...")
//                 6. Maintain consistency between responses
//                 7. If asked to summarize, always attempt to summarize ALL provided documents
//                 8. If a document is mentioned by name, specifically look for and address that document
//                 Remember: Your primary role is to accurately retrieve and present information from the provided documents.
//             `,
//             model: "gpt-4o-mini", // Ensure this model is available to you
//             tools: [{ type: "file_search" }],
//             tool_resources: {
//                 file_search: {
//                     vector_store_ids: [vectorStoreId],
//                 },
//             },
//         });

//         return assistant.id;
//     } catch (error) {
//         console.error('Error creating assistant:', error);
//         throw error;
//     }
// }


// // Main test function
// async function main() {
//     try {
//         console.log('Initializing BOE Assistant...');

//         // Initialize vector store and assistant
//         const { success, vectorStoreId } = await fetchAndUpdateVectorStore();
//         if (!success) {
//             throw new Error('Failed to initialize vector store');
//         }

//         const assistantId = await createAssistant(vectorStoreId);
//         console.log('\nInitialization complete!');
//         console.log(`Vector Store ID: ${vectorStoreId}`);
//         console.log(`Assistant ID: ${assistantId}\n`);

//         // Create readline interface for chat
//         const rl = readline.createInterface({
//             input: process.stdin,
//             output: process.stdout
//         });

//         let currentThreadId = null;

//         console.log('Chat started. Type "exit" to quit.\n');

//         const askQuestion = () => {
//             rl.question('You: ', async (input) => {
//                 if (input.toLowerCase() === 'exit') {
//                     rl.close();
//                     return;
//                 }

//                 try {
//                     const { response, threadId } = await processChat(input, currentThreadId, assistantId);
//                     currentThreadId = threadId;
//                     console.log('\nAssistant:', response, '\n');
//                 } catch (error) {
//                     console.error('Error processing message:', error);
//                 }

//                 askQuestion();
//             });
//         };

//         askQuestion();

//     } catch (error) {
//         console.error('Error in main:', error);
//         process.exit(1);
//     }
// }

// // Run the test
// main().catch(console.error);










// Function to check and update vector store with latest BOE
// async function fetchAndUpdateVectorStore(vectorStoreId = null) {
//     // const today = new Date();

//     // // Check if today is Sunday
//     // if (today.getDay() === 0) {
//     //     console.log("Today is Sunday. No publication available.");
//     //     return { success: false, vectorStoreId };
//     // }

//     // const todayFilename = `BOE-S-${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}.pdf`;
//     const today = new Date(2024, 9, 31); // Note: month is 9 because months are 0-indexed in JavaScript

//     // Check if today is Sunday
//     if (today.getDay() === 0) {
//         console.log("Today is Sunday. No publication available.");
//         return { success: false, vectorStoreId };
//     }

//     const todayFilename = `BOE-S-${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}.pdf`;
//     // This will generate: BOE-S-2024-10-31.pdf

//     try {
//         console.log('Checking for existing file...');
//         // Check if file already exists
//         const filesList = await openai.files.list();
//         const existingFile = filesList.data.find(f => f.filename === todayFilename);

//         if (existingFile) {
//             console.log(`File ${todayFilename} already exists in OpenAI storage.`);
//             return { success: true, vectorStoreId };
//         }

//         console.log('Downloading new PDF...');
//         // Download new PDF
//         const pdfContent = await downloadBoePdf(
//             today.getFullYear(),
//             today.getMonth() + 1,
//             today.getDate()
//         );

//         if (!pdfContent) {
//             console.error("Failed to download the PDF. Aborting update.");
//             return { success: false, vectorStoreId };
//         }

//         // Create or update vector store
//         if (!vectorStoreId) {
//             console.log('Creating new vector store...');
//             const vectorStore = await openai.beta.vectorStores.create({
//                 name: `Tax_Documents_${today.toISOString().replace(/[:.]/g, '_')}`,
//                 expires_after: {
//                     anchor: "last_active_at",
//                     days: 1
//                 }
//             });
//             vectorStoreId = vectorStore.id;
//             console.log(`Created new vector store with ID: ${vectorStoreId}`);
//         }

//         console.log('Creating file in OpenAI...');

//         // Create a readable stream from the PDF content
//         const stream = new Readable();
//         stream.push(pdfContent);
//         stream.push(null);

//         // Create form data
//         const formData = new FormData();
//         formData.append('file', stream, {
//             filename: todayFilename,
//             contentType: 'application/pdf'
//         });
//         formData.append('purpose', 'assistants');

//         // Create file in OpenAI
//         const file = await openai.files.create(formData);

//         console.log(`File created with ID: ${file.id}`);
//         console.log('Uploading file to vector store...');

//         // Create a file batch in the vector store
//         const batch = await openai.beta.vectorStores.fileBatches.create(
//             vectorStoreId,
//             {
//                 files: [{
//                     file_id: file.id
//                 }]
//             }
//         );

//         // Poll for completion
//         const pollInterval = 1000; // 1 second
//         const maxAttempts = 30;
//         let attempts = 0;

//         while (attempts < maxAttempts) {
//             const status = await openai.beta.vectorStores.fileBatches.retrieve(
//                 vectorStoreId,
//                 batch.id
//             );

//             if (status.status === 'completed') {
//                 console.log(`Successfully uploaded ${todayFilename} to vector store.`);
//                 return { success: true, vectorStoreId };
//             } else if (status.status === 'failed') {
//                 throw new Error(`File batch processing failed: ${status.error || 'Unknown error'}`);
//             }

//             await new Promise(resolve => setTimeout(resolve, pollInterval));
//             attempts++;
//         }

//         throw new Error('Upload timed out');

//     } catch (error) {
//         console.error('Error in fetchAndUpdateVectorStore:', error);
//         return { success: false, vectorStoreId };
//     }
// }

// // Function to process chat message
// async function processChat(message, threadId = null, assistantId) {
//     try {
//         // Create or retrieve thread
//         const thread = threadId ?
//             await openai.beta.threads.retrieve(threadId) :
//             await openai.beta.threads.create();

//         console.log(`Using thread ID: ${thread.id}`);

//         // Add message to thread
//         await openai.beta.threads.messages.create(
//             thread.id,
//             {
//                 role: "user",
//                 content: message
//             }
//         );

//         // Create run
//         const run = await openai.beta.threads.runs.create(
//             thread.id,
//             {
//                 assistant_id: assistantId,
//                 instructions: "Please thoroughly search the provided documents before responding."
//             }
//         );

//         // Wait for completion (with timeout)
//         const startTime = Date.now();
//         const timeoutMs = 30000; // 30 seconds timeout

//         while (true) {
//             if (Date.now() - startTime > timeoutMs) {
//                 throw new Error('Response timed out');
//             }

//             const runStatus = await openai.beta.threads.runs.retrieve(
//                 thread.id,
//                 run.id
//             );

//             if (runStatus.status === "completed") {
//                 const messages = await openai.beta.threads.messages.list(thread.id);
//                 const lastMessage = messages.data.find(m =>
//                     m.role === "assistant" && m.run_id === run.id
//                 );

//                 if (lastMessage) {
//                     return {
//                         response: lastMessage.content[0].text.value,
//                         threadId: thread.id
//                     };
//                 }
//             } else if (runStatus.status === "failed") {
//                 throw new Error('Assistant run failed');
//             }

//             await new Promise(resolve => setTimeout(resolve, 1000));
//         }
//     } catch (error) {
//         console.error('Error in processChat:', error);
//         throw error;
//     }
// }

// // Function to check and update vector store with latest BOE
// async function fetchAndUpdateVectorStore(vectorStoreId = null) {
//     // const today = new Date();

//     // // Check if today is Sunday
//     // if (today.getDay() === 0) {
//     //     console.log("Today is Sunday. No publication available.");
//     //     return { success: false, vectorStoreId };
//     // }

//     // const todayFilename = `BOE-S-${today.getFullYear()}-${(today.getMonth() + 1)
//     //     .toString()
//     //     .padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}.pdf`;

//     const today = new Date(2024, 9, 31); // Note: month is 9 because months are 0-indexed in JavaScript

//     // Check if today is Sunday
//     if (today.getDay() === 0) {
//         console.log("Today is Sunday. No publication available.");
//         return { success: false, vectorStoreId };
//     }

//     const todayFilename = `BOE-S-${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}.pdf`;
//     // This will generate: BOE-S-2024-10-31.pdf

//     try {
//         console.log('Checking for existing file...');
//         // Check if file already exists
//         const filesList = await openai.files.list();
//         const existingFile = filesList.data.find(f => f.filename === todayFilename);

//         if (existingFile) {
//             console.log(`File ${todayFilename} already exists in OpenAI storage.`);
//             return { success: true, vectorStoreId };
//         }

//         console.log('Downloading new PDF...');
//         // Download new PDF
//         const pdfContent = await downloadBoePdf(
//             today.getFullYear(),
//             today.getMonth() + 1,
//             today.getDate()
//         );

//         if (!pdfContent) {
//             console.error("Failed to download the PDF. Aborting update.");
//             return { success: false, vectorStoreId };
//         }

//         // Create or update vector store
//         if (!vectorStoreId) {
//             console.log('Creating new vector store...');
//             const vectorStore = await openai.beta.vectorStores.create({
//                 name: `Tax_Documents_${today.toISOString().replace(/[:.]/g, '_')}`,
//                 expires_after: {
//                     anchor: "last_active_at",
//                     days: 1,
//                 },
//             });
//             vectorStoreId = vectorStore.id;
//             console.log(`Created new vector store with ID: ${vectorStoreId}`);
//         }

//         console.log('Creating file in OpenAI...');

//         // Create file in OpenAI
//         const file = await openai.files.create({
//             file: pdfContent,
//             purpose: 'assistants',
//             filename: todayFilename,
//         });

//         console.log(`File created with ID: ${file.id}`);
//         console.log('Uploading file to vector store...');

//         // Create a file batch in the vector store
//         const batch = await openai.beta.vectorStores.fileBatches.create(
//             vectorStoreId,
//             {
//                 files: [{ file_id: file.id }],
//             }
//         );

//         // Poll for completion
//         const pollInterval = 1000; // 1 second
//         const maxAttempts = 30;
//         let attempts = 0;

//         while (attempts < maxAttempts) {
//             const status = await openai.beta.vectorStores.fileBatches.retrieve(
//                 vectorStoreId,
//                 batch.id
//             );

//             if (status.status === 'completed') {
//                 console.log(`Successfully uploaded ${todayFilename} to vector store.`);
//                 return { success: true, vectorStoreId };
//             } else if (status.status === 'failed') {
//                 throw new Error(`File batch processing failed: ${status.error || 'Unknown error'}`);
//             }

//             await new Promise(resolve => setTimeout(resolve, pollInterval));
//             attempts++;
//         }

//         throw new Error('Upload timed out');
//     } catch (error) {
//         console.error('Error in fetchAndUpdateVectorStore:', error);
//         return { success: false, vectorStoreId };
//     }
// }


// Utility function to calculate UID for BOE PDF
// const calculateUid = (year, month, day) => {
//     const startingUids = {
//       1: 1, 2: 28, 3: 54, 4: 80, 5: 106,
//       6: 133, 7: 158, 8: 185, 9: 212, 10: 237
//     };

//     const startUid = startingUids[month];
//     if (!startUid) {
//       throw new Error(`Starting UID not defined for month ${month}`);
//     }

//     let dayOffset = 0;
//     for (let d = 1; d < day; d++) {
//       const date = new Date(year, month - 1, d);
//       if (date.getDay() !== 0) { // 0 is Sunday
//         dayOffset++;
//       }
//     }

//     return startUid + dayOffset;
//   };

//   // Function to download BOE PDF
//   async function downloadBoePdf(year, month, day) {
//     try {
//       const uid = calculateUid(year, month, day);
//       const url = `https://www.boe.es/boe/dias/${year}/${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/pdfs/BOE-S-${year}-${uid}.pdf`;

//       const response = await axios.get(url, {
//         responseType: 'arraybuffer'
//       });

//       if (response.status === 200) {
//         console.log(`Successfully downloaded BOE PDF for ${year}-${month}-${day}`);
//         return response.data;
//       }
//       console.warn(`Failed to download PDF. Status code: ${response.status}`);
//       return null;
//     } catch (error) {
//       console.error('Error downloading BOE PDF:', error);
//       return null;
//     }
//   }

//   // Function to check and update vector store with latest BOE
//   // this function is a little SUS
//   async function fetchAndUpdateVectorStore(vectorStoreId = null) {
//     const today = new Date();

//     // Check if today is Sunday
//     if (today.getDay() === 0) {   // 6 might be sunday, so just check here
//       console.log("Today is Sunday. No publication available.");
//       return { success: false, vectorStoreId };
//     }

//     const todayFilename = `BOE-S-${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}.pdf`;

//     try {
//       // Check if file already exists
//       const filesList = await openai.files.list();
//       const existingFile = filesList.data.find(f => f.filename === todayFilename);

//       if (existingFile) {
//         console.log(`File ${todayFilename} already exists in OpenAI storage.`);
//         return { success: true, vectorStoreId };
//       }

//       // Download new PDF
//       const pdfContent = await downloadBoePdf(
//         today.getFullYear(),
//         today.getMonth() + 1,
//         today.getDate()
//       );

//       if (!pdfContent) {
//         console.error("Failed to download the PDF. Aborting update.");
//         return { success: false, vectorStoreId };
//       }

//       // Create or update vector store
//       if (!vectorStoreId) {
//         const vectorStore = await openai.beta.vectorStores.create({
//           name: `Tax_Documents_${today.toISOString().replace(/[:.]/g, '_')}`,
//           expires_after: {
//             anchor: "last_active_at",
//             days: 1
//           }
//         });
//         vectorStoreId = vectorStore.id;
//       }

//       // Upload file to vector store
//       const buffer = Buffer.from(pdfContent);
//       const uploadResult = await openai.beta.vectorStores.fileBatches.uploadAndPoll(
//         vectorStoreId,
//         { files: [{ filename: todayFilename, data: buffer }] }
//       );

//       if (uploadResult.status !== "completed") {
//         throw new Error(`File upload failed with status: ${uploadResult.status}`);
//       }

//       console.log(`Successfully uploaded ${todayFilename} to vector store.`);
//       return { success: true, vectorStoreId };

//     } catch (error) {
//       console.error('Error in fetchAndUpdateVectorStore:', error);
//       return { success: false, vectorStoreId };
//     }
//   }

//   // Function to create assistant
//   async function createAssistant(vectorStoreId) {
//     try {
//       const assistant = await openai.beta.assistants.create({
//         name: "BOE Document Analysis Assistant",
//         instructions: `
//           You are an consultation expert assistant specialized in analyzing and providing information from the provided spanish BOE documents. Follow these guidelines:
//           1. ALWAYS check the provided documents first before responding
//           2. If you find relevant information in the documents, cite it specifically
//           3. If you don't find relevant information in the documents, clearly state that
//           4. When summarizing documents, go through each one systematically
//           5. Reference specific document names when possible (e.g., "In BOE-S-2024-XX-XX.pdf, I found...")
//           6. Maintain consistency between responses
//           7. If asked to summarize, always attempt to summarize ALL provided documents
//           8. If a document is mentioned by name, specifically look for and address that document
//           Remember: Your primary role is to accurately retrieve and present information from the provided documents.
//         `,
//         model: "gpt-4o-mini",
//         tools: [{
//           type: "file_search"
//         }],
//         tool_resources: {
//           file_search: {
//             vector_store_ids: [vectorStoreId]
//           }
//         }
//       });

//       return assistant.id;
//     } catch (error) {
//       console.error('Error creating assistant:', error);
//       throw error;
//     }
//   }

//   // Cloud Function for file upload and initialization
//   export async function initializeAssistant(req, res) {
//     try {
//       const { vectorStoreId, assistantId } = req.body;

//       // Update vector store with latest BOE
//       const { success, vectorStoreId: newVectorStoreId } = await fetchAndUpdateVectorStore(vectorStoreId);

//       if (!success) {
//         throw new Error('Failed to update vector store');
//       }

//       // Create new assistant if ID not provided
//       const finalAssistantId = assistantId || await createAssistant(newVectorStoreId);

//       res.json({
//         success: true,
//         vectorStoreId: newVectorStoreId,
//         assistantId: finalAssistantId
//       });

//     } catch (error) {
//       console.error('Error in initializeAssistant:', error);
//       res.status(500).json({
//         success: false,
//         error: error.message
//       });
//     }
//   }

//   // Cloud Function for chat interaction
//   export async function chat(req, res) {
//     try {
//       const { message, threadId, vectorStoreId, assistantId } = req.body;

//       if (!message || !assistantId) {
//         throw new Error('Missing required parameters');
//       }

//       // Create or retrieve thread
//       const thread = threadId ? 
//         await openai.beta.threads.retrieve(threadId) :
//         await openai.beta.threads.create();

//       // Add message to thread
//       await openai.beta.threads.messages.create(
//         thread.id,
//         {
//           role: "user",
//           content: message
//         }
//       );


//       // Create run
//       const run = await openai.beta.threads.runs.create(
//         thread.id,
//         {
//           assistant_id: assistantId,
//           instructions: `
//           You are an consultation expert assistant specialized in analyzing and providing information from the provided spanish BOE documents. Follow these guidelines:
//           1. Thoroughly analyze the provided documents for relevant information before responding. Ensure that answers are specific to and relevant to the content of the documents. If relevant information is not found within the documents, perform a web search to gather accurate information. Present the information clearly and concisely.
//           1. ALWAYS check the provided documents first before responding
//           4. When summarizing documents, go through each one systematically
//           5. Reference specific document names when possible (e.g., "In BOE-S-2024-XX-XX.pdf, I found...")
//           6. Maintain consistency between responses
//           7. If asked to summarize, always attempt to summarize ALL provided documents
//           8. If a document is mentioned by name, specifically look for and address that document
//           Remember: Your primary role is to accurately retrieve and present information from the provided documents.
//         `
//         }
//       );

//       // Wait for completion (with timeout)
//       const startTime = Date.now();
//       const timeoutMs = 30000; // 30 seconds timeout

//       while (true) {
//         if (Date.now() - startTime > timeoutMs) {
//           throw new Error('Response timed out');
//         }

//         const runStatus = await openai.beta.threads.runs.retrieve(
//           thread.id,
//           run.id
//         );

//         if (runStatus.status === "completed") {
//           const messages = await openai.beta.threads.messages.list(thread.id);
//           const lastMessage = messages.data.find(m => 
//             m.role === "assistant" && m.run_id === run.id
//           );

//           if (lastMessage) {
//             res.json({
//               success: true,
//               threadId: thread.id,
//               response: lastMessage.content[0].text.value
//             });
//             return;
//           }
//         } else if (runStatus.status === "failed") {
//           throw new Error('Assistant run failed');
//         }

//         await new Promise(resolve => setTimeout(resolve, 1000));
//       }

//     } catch (error) {
//       console.error('Error in chat:', error);
//       res.status(500).json({
//         success: false,
//         error: error.message
//       });
//     }
//   }














// const { OpenAIApi } = require('openai');

// const openai = new OpenAIApi(process.env.OPENAI_API_KEY);

// async function createVectorStore(files) {
//   try {
//     const vectorStore = await openai.beta.vectorStores.create({
//       name: `Tax_Documents_${new Date().toISOString()}`,
//       expiresAfter: {
//         anchor: 'lastActiveAt',
//         days: 1
//       }
//     });

//     const batchSize = 10;
//     for (let i = 0; i < files.length; i += batchSize) {
//       const batch = files.slice(i, i + batchSize);
//       const uploadResult = await openai.beta.vectorStores.fileBatches.uploadAndPoll({
//         vectorStoreId: vectorStore.id,
//         files: batch
//       });

//       if (uploadResult.status !== 'completed') {
//         throw new Error(`File upload failed with status: ${uploadResult.status}`);
//       }
//     }

//     return vectorStore.id;

//   } catch (err) {
//     console.error('Error creating vector store:', err);
//     throw err;
//   }
// }

// async function createAssistant(vectorStoreId) {
//   try {
//     const instructions = `You are an expert assistant specialized in analyzing and providing information from the provided documents. Follow these guidelines:
//       1. ALWAYS check the provided documents first before responding
//       2. If you find relevant information in the documents, cite it specifically
//       3. If you don't find relevant information in the documents, clearly state that
//       4. When summarizing documents, go through each one systematically
//       5. Reference specific document names when possible (e.g., "In BOE-S-2024-XX-XX.pdf, I found...")
//       6. Maintain consistency between responses 
//       7. If asked to summarize, always attempt to summarize ALL provided documents
//       8. If a document is mentioned by name, specifically look for and address that document
//       Remember: Your primary role is to accurately retrieve and present information from the provided documents.`;

//     const assistant = await openai.beta.assistants.create({
//       name: 'BOE Document Analysis Assistant',
//       instructions,
//       model: 'gpt-4',
//       tools: [{
//         type: 'fileSearch'
//       }],
//       toolResources: {
//         fileSearch: {
//           vectorStoreIds: [vectorStoreId]  
//         }
//       }
//     });

//     return assistant.id;

//   } catch (err) {
//     console.error('Error creating assistant:', err);
//     throw err;  
//   }
// }

// function processMessage(message) {
//   try {
//     if (message.content?.length) {
//       return message.content.map(item => item.text?.value || item.text || '').join('\n');
//     } else if (message.value) {
//       return message.value;  
//     } else if (typeof message.content === 'string') {
//       return message.content;
//     } else {
//       return JSON.stringify(message);
//     }
//   } catch (err) {
//     console.error('Error processing message:', err);
//     return JSON.stringify(message);
//   }
// }

// // Cloud Function 1: Initialize assistant and vector store
// exports.initializeAssistant = async (req, res) => {
//   const { assistantId, vectorStoreId, files } = req.body;

//   try {
//     let assistant, vectorStore;

//     if (assistantId && vectorStoreId) {
//       assistant = await openai.beta.assistants.retrieve(assistantId);
//       vectorStore = await openai.beta.vectorStores.retrieve(vectorStoreId);
//     } else {
//       vectorStore = await createVectorStore(files);
//       assistant = await createAssistant(vectorStore);  
//     }

//     res.status(200).json({
//       assistantId: assistant.id,
//       vectorStoreId: vectorStore.id
//     });

//   } catch (err) {
//     console.error('Failed to initialize assistant:', err);
//     res.status(500).json({ error: 'Failed to initialize assistant' });  
//   }
// };

// // Cloud Function 2: Handle user messages
// exports.handleMessage = async (req, res) => {
//   const { assistantId, message } = req.body;

//   try {
//     const thread = await openai.beta.threads.create();

//     await openai.beta.threads.messages.create({
//       threadId: thread.id, 
//       role: 'user',
//       content: message
//     });

//     const run = await openai.beta.threads.runs.create({
//       threadId: thread.id,
//       assistantId,
//       instructions: "Please thoroughly search the provided documents before responding." 
//     });

//     let runStatus = await openai.beta.threads.runs.retrieve({
//       threadId: thread.id, 
//       runId: run.id
//     });

//     while (runStatus.status !== 'completed') {
//       await new Promise(resolve => setTimeout(resolve, 1000));
//       runStatus = await openai.beta.threads.runs.retrieve({
//         threadId: thread.id,
//         runId: run.id  
//       });
//     }

//     const messages = await openai.beta.threads.messages.list({ threadId: thread.id });
//     const assistantMessage = messages.data.find(m => m.role === 'assistant' && m.runId === run.id);

//     res.status(200).json({ response: processMessage(assistantMessage) });

//   } catch (err) {  
//     console.error('Failed to process message:', err);
//     res.status(500).json({ error: 'Failed to process message' });
//   }
// };

























// exports.fetchBoeDataToJson = functions.https.onCall(async (data, context) => {
//     // Validate input, ensuring a date is provided
//     if (!data.date) {
//         throw new functions.https.HttpsError('invalid-argument', 'The function must be called with one argument "date".');
//     }

//     const date = data.date; // Extract date from the input data
//     console.log(`Fetching BOE data for date: ${date}`);

//     try {
//         // Construct the URL to the BOE API
//         const url = `https://www.boe.es/diario_boe/xml.php?id=BOE-S-${date}`;
//         // Fetch the XML data
//         const response = await axios.get(url);
//         const xmlData = response.data;

//         // Convert the XML data to JSON
//         const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
//         const result = await parser.parseStringPromise(xmlData);

//         // Log the successful conversion
//         console.log(`Successfully converted BOE XML data to JSON for date: ${date}`);

//         // Return the JSON result
//         return { data: result };
//     } catch (error) {
//         console.error(`Failed to fetch or convert BOE data for date: ${date}, error`);
//         // Throw a Firebase-specific error if the operation fails
//         throw new functions.https.HttpsError('unknown', `Failed to fetch or convert data: ${error.message}`);
//     }
// });



















// // // setup.js
// import OpenAI from 'openai';
// import readline from 'readline';
// import axios from 'axios';
// import { fileURLToPath } from 'url';
// import path from 'path';
// import dotenv from 'dotenv';

// // Load environment variables
// dotenv.config();

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // Initialize OpenAI client
// const openai = new OpenAI({
//     apiKey: process.env.OPENAI_API_KEY
// });

// // Logger utility
// const logger = {
//     info: (message, data = null) => {
//         const timestamp = new Date().toISOString();
//         console.log(`[${timestamp}] INFO: ${message}`);
//         if (data) {
//             console.log('Data:', JSON.stringify(data, null, 2));
//         }
//     },
//     error: (message, error = null) => {
//         const timestamp = new Date().toISOString();
//         console.error(`[${timestamp}] ERROR: ${message}`);
//         if (error) {
//             console.error('Error details:', error);
//         }
//     }
// };

// async function getValidBoeDate() {
//     const today = new Date();

//     // If it's Sunday, return Saturday's date
//     if (today.getDay() === 0) {
//         const yesterday = new Date(today);
//         yesterday.setDate(today.getDate() - 1);
//         return yesterday.toISOString().split('T')[0].replace(/-/g, '');
//     }

//     return today.toISOString().split('T')[0].replace(/-/g, '');
// }

// async function fetchBoeData(dateStr = null) {
//     // If no date is provided, get the appropriate date (today or Saturday if it's Sunday)
//     const targetDate = dateStr || await getValidBoeDate();
//     logger.info(`Attempting to fetch BOE data for date: ${targetDate}`);

//     try {
//         const url = `https://www.boe.es/datosabiertos/api/boe/sumario/${targetDate}`;
//         logger.info(`Making request to BOE API: ${url}`);

//         const response = await axios.get(url, {
//             headers: {
//                 "Accept": "application/json",
//                 "Content-Type": "application/json"
//             },
//             timeout: 10000
//         });

//         if (response.status === 200 && response.data) {
//             logger.info(`Successfully retrieved BOE data for ${targetDate}`);
//             logger.info(`Response size: ${JSON.stringify(response.data).length} characters`);
//             return response.data;
//         }

//         // If the API returns a non-200 status, try the previous working day
//         if (response.status === 404) {
//             logger.warn(`No data found for ${targetDate}, trying previous working day`);
//             const previousDate = new Date(targetDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
//             previousDate.setDate(previousDate.getDate() - 1);
//             // If previous day is Sunday, go back one more day
//             if (previousDate.getDay() === 0) {
//                 previousDate.setDate(previousDate.getDate() - 1);
//             }
//             const previousDateStr = previousDate.toISOString().split('T')[0].replace(/-/g, '');
//             return await fetchBoeData(previousDateStr);
//         }

//         logger.error(`Failed to fetch BOE data`, {
//             statusCode: response.status,
//             statusText: response.statusText
//         });
//         throw new Error(`BOE API returned status ${response.status}`);
//     } catch (error) {
//         logger.error(`Error fetching BOE data`, error);
//         throw error;
//     }
// }

// // Update the assistant instructions to include information about date handling
// async function createAssistant() {
//     logger.info('Starting assistant creation/retrieval process');

//     try {
//         // Check for existing assistant
//         const assistants = await openai.beta.assistants.list({
//             order: "desc",
//             limit: 100
//         });

//         const existingAssistant = assistants.data.find(
//             assistant => assistant.name === "Spanish BOE Assistant BETA"
//         );

//         if (existingAssistant) {
//             logger.info(`Found existing assistant with ID: ${existingAssistant.id}`);
//             return existingAssistant.id;
//         }

//         // Create new assistant if none exists
//         logger.info('Creating new assistant...');
//         const assistant = await openai.beta.assistants.create({
//             name: "Spanish BOE Assistant BETA",
//             instructions: `
//                 You are an expert legal consultation assistant specializing in analyzing Spanish laws and regulations.
//                 Your responses should be comprehensive and detailed, following this structure:

//                 1. For BOE-related queries:
//                    - Note: BOE data is not available on Sundays. The system will automatically fetch Saturday's data.
//                    - Always start with the date of the BOE being analyzed
//                    - Provide a detailed summary of all sections
//                    - Include specific references to legal documents
//                    - Explain practical implications of important changes
//                    - Use proper legal terminology with explanations
//                    - Format responses with clear headers and bullet points
//                    - Include direct references to BOE documents when available

//                 2. For non-BOE queries:
//                    - Clearly state that you're a legal assistant focused on Spanish law
//                    - Redirect users to appropriate resources for non-legal questions
//                    - Maintain professional tone while being helpful

//                 FUNCTION CALLING RULES:
//                 - The fetchBoeData function will automatically handle date adjustments:
//                   * On Sundays, it will fetch Saturday's data
//                   * If data is not available for the requested date, it will try the previous working day
//                 - Analyze and present ALL relevant information from the API response
//                 - Structure your response in a clear, hierarchical format

//                 Response Format for BOE Analysis:
//                 1. Date and Reference
//                 2. General Overview
//                 3. Section-by-Section Analysis
//                    - Detailed breakdown of each section
//                    - Highlight key changes and implications
//                 4. Important Announcements
//                 5. Practical Implications
//                 6. Additional Notes or Recommendations

//                 Always maintain high detail and professional legal expertise in your responses.
//             `,
//             model: "gpt-4o-mini",
//             tools: [{
//                 type: "function",
//                 function: {
//                     name: "fetchBoeData",
//                     description: "Fetches BOE (Boletín Oficial del Estado) data, automatically handling weekends and unavailable dates",
//                     parameters: {
//                         type: "object",
//                         properties: {
//                             date: {
//                                 type: "string",
//                                 description: "Date in YYYYMMDD format. If not provided or if it's Sunday, will use appropriate fallback date."
//                             }
//                         },
//                         required: ["date"],
//                         additionalProperties: false
//                     },
//                     strict: true
//                 }
//             }]
//         });

//         logger.info(`Created new assistant with ID: ${assistant.id}`);
//         return assistant.id;
//     } catch (error) {
//         logger.error('Error in createAssistant:', error);
//         throw error;
//     }
// }

// // Process chat messages
// async function processChat(input, threadId, assistantId) {
//     logger.info(`Processing chat input: "${input}"`);
//     logger.info(`Thread ID: ${threadId}, Assistant ID: ${assistantId}`);

//     try {
//         if (!threadId) {
//             const thread = await openai.beta.threads.create();
//             threadId = thread.id;
//             logger.info(`Created new thread with ID: ${threadId}`);
//         }

//         // Create message with clear context
//         await openai.beta.threads.messages.create(threadId, {
//             role: "user",
//             content: input
//         });

//         // Create and monitor run
//         const run = await openai.beta.threads.runs.create(threadId, {
//             assistant_id: assistantId,
//             instructions: "Provide detailed and comprehensive responses. For BOE queries, include all relevant information and structure it clearly."
//         });

//         // Enhanced run status handling
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
//                                 output: JSON.stringify(data)
//                             });
//                         } catch (error) {
//                             logger.error('Error in fetchBoeData:', error);
//                             toolOutputs.push({
//                                 tool_call_id: toolCall.id,
//                                 output: JSON.stringify({ error: "Failed to fetch BOE data" })
//                             });
//                         }
//                     }
//                 }

//                 await openai.beta.threads.runs.submitToolOutputs(
//                     threadId,
//                     run.id,
//                     { tool_outputs: toolOutputs }
//                 );
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

// // Main function to run the chat interface
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
//             rl.question('You: ', async (input) => {
//                 if (input.toLowerCase() === 'exit') {
//                     logger.info('User requested exit');
//                     rl.close();
//                     return;
//                 }

//                 try {
//                     const { response, threadId } = await processChat(input, currentThreadId, assistantId);
//                     currentThreadId = threadId;
//                     console.log('\nAssistant:', response, '\n');
//                 } catch (error) {
//                     logger.error('Error processing message:', error);
//                     console.log('\nError:', error.message, '\n');
//                 }

//                 askQuestion();
//             });
//         };

//         console.log('Chat started. Type "exit" to quit.\n');
//         askQuestion();
//     } catch (error) {
//         logger.error('Error in main:', error);
//         process.exit(1);
//     }
// }

// // Start the application
// main().catch(error => {
//     logger.error('Unhandled error in application:', error);
//     process.exit(1);
// });





















// import OpenAI from 'openai';
// import axios from 'axios';
// import fs from 'fs';
// import path from 'path';
// import { fileURLToPath } from 'url';
// import * as readline from 'readline';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // Initialize OpenAI client
// const openai = new OpenAI({
//     apiKey: process.env.OPENAI_API_KEY
// });

// // Logger utility
// const logger = {
//     info: (message, data = null) => {
//         const timestamp = new Date().toISOString();
//         console.log(`[${timestamp}] INFO: ${message}`);
//         if (data) {
//             console.log('Data:', JSON.stringify(data, null, 2));
//         }
//     },
//     error: (message, error = null) => {
//         const timestamp = new Date().toISOString();
//         console.error(`[${timestamp}] ERROR: ${message}`);
//         if (error) {
//             console.error('Error details:', error);
//         }
//     }
// };

// async function fetchBoeData() {
//     const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
//     logger.info(`Attempting to fetch BOE data for today: ${today}`);

//     try {
//         const url = `https://www.boe.es/datosabiertos/api/boe/sumario/20241116`;
//         logger.info(`Making request to BOE API: ${url}`);

//         const response = await axios.get(url, {
//             headers: {
//                 "Accept": "application/json",
//                 "Content-Type": "application/json"
//             }
//         });

//         if (response.status === 200 && response.data) {
//             logger.info(`Successfully retrieved BOE data for ${today}`);
//             logger.info(`Response size: ${JSON.stringify(response.data).length} characters`);

//             // Instead of validating the date, we'll trust the API's response
//             // since it's the official source for today's publication
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
//             assistant => assistant.name === "Spanish BOE Assistant BETA"
//         );

//         if (existingAssistant) {
//             logger.info(`Found existing assistant with ID: ${existingAssistant.id}`);
//             return existingAssistant.id;
//         }

//         logger.info('Creating new assistant...');
//         const assistant = await openai.beta.assistants.create({
//             name: "Spanish BOE Assistant BETA",
//             instructions: `
//                 You are an expert legal consultation assistant specializing in analyzing Spanish laws and regulations.
//                 Your primary responsibilities:

//                 1. Always work with TODAY'S BOE data only - verify the date in the API response
//                 2. Begin each response by stating the BOE publication date you're analyzing
//                 3. Provide comprehensive analysis of the BOE content:
//                    - Summarize key legislative changes
//                    - Highlight important announcements
//                    - Explain practical implications
//                 4. Structure your responses clearly:
//                    - Date and reference
//                    - Summary of key points
//                    - Detailed analysis
//                    - Practical implications
//                 5. Use your knowledge to provide context and explain technical terms
//                 6. If no BOE data is available for today, explicitly state this

//                 Remember: Quality and accuracy are paramount. Always verify you're working
//                 with current data and provide detailed, well-structured responses.
//             `,
//             model: "gpt-4o-mini",
//             tools: [{
//                 type: "function",
//                 function: {
//                     name: "fetchBoeData",
//                     description: "Fetches today's BOE (Boletín Oficial del Estado) data",
//                     parameters: {
//                         type: "object",
//                         properties: {},
//                         required: []
//                     }
//                 }
//             }]
//         });

//         logger.info(`Created new assistant with ID: ${assistant.id}`);
//         return assistant.id;
//     } catch (error) {
//         logger.error('Error in createAssistant:', error);
//         throw error;
//     }
// }

// async function processChat(input, threadId, assistantId) {
//     logger.info(`Processing chat input: "${input}"`);
//     logger.info(`Thread ID: ${threadId}, Assistant ID: ${assistantId}`);

//     try {
//         if (!threadId) {
//             const thread = await openai.beta.threads.create();
//             threadId = thread.id;
//             logger.info(`Created new thread with ID: ${threadId}`);
//         }

//         // Fetch BOE data
//         logger.info('Fetching BOE data...');
//         const boeData = await fetchBoeData();
//         if (!boeData) {
//             throw new Error("Failed to fetch BOE data");
//         }
//         logger.info(`Successfully fetched BOE data with publication date: ${boeData.fecha}`);

//         // Create message with full BOE data for assistant to analyze
//         logger.info('Creating message in thread...');
//         await openai.beta.threads.messages.create(threadId, {
//             role: "user",
//             content: JSON.stringify({
//                 query: input,
//                 boeData: boeData
//             })
//         });

//         // Create and monitor run
//         logger.info('Creating assistant run...');
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
//                     if (toolCall.function.name === "fetchBoeData") {
//                         logger.info(`Processing tool call: ${toolCall.function.name}`);
//                         const data = await fetchBoeData();
//                         toolOutputs.push({
//                             tool_call_id: toolCall.id,
//                             output: JSON.stringify(data)
//                         });
//                     }
//                 }

//                 await openai.beta.threads.runs.submitToolOutputs(
//                     threadId,
//                     run.id,
//                     { tool_outputs: toolOutputs }
//                 );
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
//             rl.question('You: ', async (input) => {
//                 if (input.toLowerCase() === 'exit') {
//                     logger.info('User requested exit');
//                     rl.close();
//                     return;
//                 }

//                 try {
//                     const { response, threadId } = await processChat(input, currentThreadId, assistantId);
//                     currentThreadId = threadId;
//                     console.log('\nAssistant:', response, '\n');
//                 } catch (error) {
//                     logger.error('Error processing message:', error);
//                 }

//                 askQuestion();
//             });
//         };

//         console.log('Chat started. Type "exit" to quit.\n');
//         askQuestion();
//     } catch (error) {
//         logger.error('Error in main:', error);
//         process.exit(1);
//     }
// }

// main().catch(error => {
//     logger.error('Unhandled error in application:', error);
//     process.exit(1);
// });


























// import OpenAI from 'openai';
// import axios from 'axios';
// import fs from 'fs';
// import path from 'path';
// import { fileURLToPath } from 'url';
// import * as readline from 'readline';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // Initialize OpenAI client
// const openai = new OpenAI({
//     apiKey: process.env.OPENAI_API_KEY
// });

// // Logger utility
// const logger = {
//     info: (message, data = null) => {
//         const timestamp = new Date().toISOString();
//         console.log(`[${timestamp}] INFO: ${message}`);
//         if (data) {
//             console.log('Data:', JSON.stringify(data, null, 2));
//         }
//     },
//     error: (message, error = null) => {
//         const timestamp = new Date().toISOString();
//         console.error(`[${timestamp}] ERROR: ${message}`);
//         if (error) {
//             console.error('Error details:', error);
//         }
//     }
// };
// async function fetchBoeData() {
//     const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
//     logger.info(`Attempting to fetch BOE data for today: ${today}`);

//     try {
//         const url = `https://www.boe.es/datosabiertos/api/boe/sumario/${today}`
//         logger.info(`Making request to BOE API: ${url}`);

//         const response = await axios.get(url, {
//             headers: {
//                 "Accept": "application/json",
//                 "Content-Type": "application/json"
//             }
//         });

//         if (response.status === 200 && response.data) {
//             logger.info(`Successfully retrieved BOE data for ${today}`);
//             logger.info(`Response size: ${JSON.stringify(response.data).length} characters`);
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
//             assistant => assistant.name === "Spanish BOE Assistant BETA"
//         );

//         if (existingAssistant) {
//             logger.info(`Found existing assistant with ID: ${existingAssistant.id}`);
//             return existingAssistant.id;
//         }

//         logger.info('Creating new assistant...');
//         const assistant = await openai.beta.assistants.create({
//             name: "Spanish BOE Assistant BETA",
//             instructions: `
//                 You are an expert legal consultation assistant specializing in analyzing Spanish laws and regulations.
//                 Your primary responsibilities:

//                 1. Analyze BOE data when specifically asked about current legal updates or today's BOE
//                 2. Begin each response by stating the BOE publication date you're analyzing
//                 3. Provide comprehensive analysis of the BOE content:
//                    - Summarize key legislative changes
//                    - Highlight important announcements
//                    - Explain practical implications
//                 4. Structure your responses clearly:
//                    - Date and reference
//                    - Summary of key points
//                    - Detailed analysis
//                    - Practical implications
//                 5. Use your knowledge to provide context and explain technical terms
//                 6. If no BOE data is available, explicitly state this

//                 FUNCTION CALLING GUIDELINES:
//                 - Only call fetchBoeData when user specifically asks about today's BOE or recent updates
//                 - Don't call the function for general legal questions or historical queries
//                 - When BOE data is received, provide comprehensive analysis

//                 Remember: Quality and accuracy are paramount. Always verify you're working
//                 with current data and provide detailed, well-structured responses.
//             `,
//             model: "gpt-4o-mini",
//             tools: [{
//                 type: "function",
//                 function: {
//                     name: "fetchBoeData",
//                     description: "Fetches today's BOE (Boletín Oficial del Estado) data",
//                     parameters: {
//                         type: "object",
//                         properties: {
//                             date: {
//                                 type: "string",
//                                 description: "Date in YYYYMMDD format"
//                             }
//                         },
//                         required: ["date"],
//                         additionalProperties: false
//                     },
//                     strict: true
//                 }
//             }]
//         });

//         logger.info(`Created new assistant with ID: ${assistant.id}`);
//         return assistant.id;
//     } catch (error) {
//         logger.error('Error in createAssistant:', error);
//         throw error;
//     }
// }

// async function processChat(input, threadId, assistantId) {
//     logger.info(`Processing chat input: "${input}"`);
//     logger.info(`Thread ID: ${threadId}, Assistant ID: ${assistantId}`);

//     try {
//         if (!threadId) {
//             const thread = await openai.beta.threads.create();
//             threadId = thread.id;
//             logger.info(`Created new thread with ID: ${threadId}`);
//         }

//         // Add user message without BOE data
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
//             rl.question('You: ', async (input) => {
//                 if (input.toLowerCase() === 'exit') {
//                     logger.info('User requested exit');
//                     rl.close();
//                     return;
//                 }

//                 try {
//                     const { response, threadId } = await processChat(input, currentThreadId, assistantId);
//                     currentThreadId = threadId;
//                     console.log('\nAssistant:', response, '\n');
//                 } catch (error) {
//                     logger.error('Error processing message:', error);
//                 }

//                 askQuestion();
//             });
//         };

//         console.log('Chat started. Type "exit" to quit.\n');
//         askQuestion();
//     } catch (error) {
//         logger.error('Error in main:', error);
//         process.exit(1);
//     }
// }

// main().catch(error => {
//     logger.error('Unhandled error in application:', error);
//     process.exit(1);
// });






































import OpenAI from 'openai';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Logger utility
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
        const url = `https://www.boe.es/datosabiertos/api/boe/sumario/${today}`
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
async function createAssistant() {
    logger.info('Starting assistant creation/retrieval process');

    try {
        const assistants = await openai.beta.assistants.list({
            order: "desc",
            limit: 100
        });

        const existingAssistant = assistants.data.find(
            assistant => assistant.name === "Spanish BOE Assistant BETA"
        );

        if (existingAssistant) {
            logger.info(`Found existing assistant with ID: ${existingAssistant.id}`);
            return existingAssistant.id;
        }

        logger.info('Creating new assistant...');
        const assistant = await openai.beta.assistants.create({
            name: "Spanish BOE Assistant BETA",
            instructions: `
                        You are an expert legal consultation assistant specializing in analyzing Spanish laws and regulations.
                        
                        QUERY UNDERSTANDING AND RESPONSE:
                        1. When to Access BOE Data:
                        - Direct requests about today's BOE or recent updates
                        - Questions about specific laws/articles mentioning BOE
                        - Queries about current Spanish legislation
                        - Questions about legal updates even if 'BOE' isn't explicitly mentioned
                        - Requests about specific laws when context suggests current BOE content
                        
                        2. Response Structure:
                        - Begin with BOE publication date being analyzed
                        - Provide date and reference (e.g., BOE-S-2024-XXX)
                        - Summary of key points
                        - Detailed analysis
                        - Practical implications
                        
                        3. Content Analysis Requirements:
                        - Summarize key legislative changes
                        - Highlight important announcements
                        - Explain practical implications
                        - For specific laws/articles:
                            * Cite exact article numbers when available
                            * Explain direct implications
                            * Note any modifications to existing laws
                            * Include implementation deadlines if specified
                        
                        4. Legal Response Guidelines:
                        - If asked about specific laws/articles:
                            * Check if they're in current BOE
                            * If found, provide detailed analysis
                            * If not in current BOE, clearly state this
                        - For general legal queries:
                            * Clarify if user wants current BOE information
                            * Provide relevant context from expertise
                        
                        CONFIDENTIALITY GUIDELINES:
                        - Never disclose information about:
                            * System architecture or implementation
                            * Technical stack or programming languages
                            * Data processing methods
                            * Learning or updating mechanisms
                        - If asked about system functionality:
                            * Respond: "I focus on providing legal information and analysis. For technical inquiries, please contact system administrators."
                        
                        FUNCTION CALLING GUIDELINES:
                        - Call fetchBoeData when:
                            * User explicitly asks about today's BOE
                            * Questions involve current/recent legal updates
                            * Requests for specific laws in current BOE
                            * Queries about latest Spanish legislation
                        - Don't call the function for:
                            * Historical legal questions
                            * General legal principles
                            * Non-Spanish legislation
                        
                        ERROR HANDLING:
                        - If BOE data is unavailable:
                            * Clearly state the limitation
                            * Offer to provide general legal context
                            * Suggest trying again later
                        - For unclear queries:
                            * Ask for clarification about timeframe
                            * Confirm if user wants current BOE information
                        
                        Remember:
                        1. Quality and accuracy are paramount
                        2. Verify working with current data
                        3. Provide structured, detailed responses
                        4. Maintain focus on legal analysis
                        5. Preserve system confidentiality
                        6. If in doubt about BOE relevance, ask for clarification
                    `,
            model: "gpt-4o-mini",
            tools: [{
                type: "function",
                function: {
                    name: "fetchBoeData",
                    description: "Fetches today's BOE (Boletín Oficial del Estado) data",
                    parameters: {
                        type: "object",
                        properties: {
                            date: {
                                type: "string",
                                description: "Date in YYYYMMDD format"
                            }
                        },
                        required: ["date"],
                        additionalProperties: false
                    },
                    strict: true
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

        // Add user message without BOE data
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
                    if (toolCall.function.name === "fetchBoeData") {
                        logger.info(`Processing tool call: ${toolCall.function.name}`);
                        try {
                            const data = await fetchBoeData();
                            if (data) {
                                toolOutputs.push({
                                    tool_call_id: toolCall.id,
                                    output: JSON.stringify(data)
                                });
                            } else {
                                toolOutputs.push({
                                    tool_call_id: toolCall.id,
                                    output: JSON.stringify({
                                        error: "No BOE data available",
                                        message: "Could not fetch BOE data for the requested date"
                                    })
                                });
                            }
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