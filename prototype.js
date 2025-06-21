import OpenAI from 'openai';
import axios from 'axios';

const API_CONFIG = {
    BOE: {
        baseUrl: 'https://boe.es/datosabiertos/api/boe',
        endpoints: {
            summary: '/sumario'
        }
    },
    BORME: {
        baseUrl: 'https://boe.es/datosabiertos/api/borme',
        endpoints: {
            summary: '/sumario'
        }
    }
};

class LegalDocumentAPI {
    constructor() {
        this.API_CONFIG = API_CONFIG;  // Make config accessible to instance
        this.axiosInstance = axios.create({
            timeout: 30000,
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate',
                'User-Agent': 'Legal-Consultation-Bot/1.0'
            },
            validateStatus: status => status < 500
        });
    }

    formatDate(date) {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    async getBOESummary(date) {
        try {
            const formattedDate = this.formatDate(date);
            const url = `${this.API_CONFIG.BOE.baseUrl}${this.API_CONFIG.BOE.endpoints.summary}/${formattedDate}`;
            console.log('Fetching BOE URL:', url);
            
            const response = await this.axiosInstance.get(url);
            console.log('BOE Response Status:', response.status);

            if (response.status === 404 || !response.data) {
                console.log('No BOE publication found for date:', formattedDate);
                return null;
            }

            if (response.status !== 200) {
                console.error('BOE API Error:', response.status, response.statusText);
                return null;
            }

            return this.processBOEResponse(response.data);
        } catch (error) {
            console.error('BOE API Error:', error.message);
            return null;
        }
    }

    async getBORMESummary(date) {
        try {
            const formattedDate = this.formatDate(date);
            const url = `${this.API_CONFIG.BORME.baseUrl}${this.API_CONFIG.BORME.endpoints.summary}/${formattedDate}`;
            console.log('Fetching BORME URL:', url);
            
            const response = await this.axiosInstance.get(url);
            console.log('BORME Response Status:', response.status);

            if (response.status === 404 || !response.data) {
                console.log('No BORME publication found for date:', formattedDate);
                return null;
            }

            if (response.status !== 200) {
                console.error('BORME API Error:', response.status, response.statusText);
                return null;
            }

            return this.processBORMEResponse(response.data);
        } catch (error) {
            console.error('BORME API Error:', error.message);
            return null;
        }
    }

    processBOEResponse(sumario) {
        try {
            if (!sumario?.diario) {
                console.warn('BOE response missing diario');
                return null;
            }

            const { diario } = sumario;
            const sections = Array.isArray(diario.seccion) ? diario.seccion : [diario.seccion].filter(Boolean);

            return {
                type: 'BOE',
                date: sumario.metadatos?.fecha_publicacion,
                summary: diario.sumario_diario ? {
                    id: diario.sumario_diario.identificador,
                    pdfUrl: diario.sumario_diario.url_pdf
                } : null,
                sections: sections.map(section => {
                    const departments = Array.isArray(section.departamento) ? 
                        section.departamento : 
                        (section.departamento ? [section.departamento] : []);

                    return {
                        code: section.codigo,
                        name: section.nombre,
                        departments: departments.map(dept => ({
                            code: dept.codigo,
                            name: dept.nombre,
                            items: this.extractItems(dept)
                        }))
                    };
                })
            };
        } catch (error) {
            console.error('Error processing BOE response:', error);
            console.error('Sumario data:', JSON.stringify(sumario, null, 2));
            return null;
        }
    }

    processBORMEResponse(sumario) {
        try {
            if (!sumario?.diario) {
                console.warn('BORME response missing diario');
                return null;
            }

            const { diario } = sumario;
            const sections = Array.isArray(diario.seccion) ? diario.seccion : [diario.seccion].filter(Boolean);

            return {
                type: 'BORME',
                date: sumario.metadatos?.fecha_publicacion,
                summary: diario.sumario_diario ? {
                    id: diario.sumario_diario.identificador,
                    pdfUrl: diario.sumario_diario.url_pdf
                } : null,
                sections: sections.map(section => ({
                    code: section.codigo,
                    name: section.nombre,
                    items: (Array.isArray(section.item) ? section.item : section.item ? [section.item] : [])
                        .map(item => ({
                            id: item.identificador,
                            title: item.titulo,
                            pdfUrl: item.url_pdf,
                            htmlUrl: item.url_html,
                            xmlUrl: item.url_xml
                        }))
                }))
            };
        } catch (error) {
            console.error('Error processing BORME response:', error);
            console.error('Sumario data:', JSON.stringify(sumario, null, 2));
            return null;
        }
    }

    extractItems(container) {
        try {
            const items = [];
            
            if (container.item) {
                const directItems = Array.isArray(container.item) ? container.item : [container.item];
                items.push(...directItems.map(item => ({
                    id: item.identificador,
                    control: item.control,
                    title: item.titulo,
                    pdfUrl: item.url_pdf,
                    htmlUrl: item.url_html,
                    xmlUrl: item.url_xml
                })));
            }

            if (container.epigrafe) {
                const epigraphs = Array.isArray(container.epigrafe) ? container.epigrafe : [container.epigrafe];
                epigraphs.forEach(ep => {
                    if (ep.item) {
                        const epItems = Array.isArray(ep.item) ? ep.item : [ep.item];
                        items.push(...epItems.map(item => ({
                            id: item.identificador,
                            control: item.control,
                            title: item.titulo,
                            pdfUrl: item.url_pdf,
                            htmlUrl: item.url_html,
                            xmlUrl: item.url_xml,
                            epigraph: ep.nombre
                        })));
                    }
                });
            }

            return items;
        } catch (error) {
            console.error('Error extracting items:', error);
            return [];
        }
    }
}

async function createLegalAssistant() {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });

    const instructions = `
    You are a specialized legal consultation assistant for Spanish law, with expertise in analyzing BOE (Boletín Oficial del Estado) and BORME (Boletín Oficial del Registro Mercantil) publications.

    CORE CAPABILITIES:
    1. Document Analysis
       - Direct access to BOE and BORME publications
       - Real-time information retrieval
       - Cross-reference capability between documents

    2. Query Processing
       - Legal topic identification
       - Context-aware search
       - Temporal relevance understanding

    3. Legal Framework Navigation
       - Section-specific expertise (e.g., BOE sections I-V, BORME sections A-C)
       - Department and category organization
       - Modification tracking

    4. Response Structure
       - Primary source citations (BOE/BORME references)
       - Chronological organization
       - Clear practical implications

    OPERATING RULES:
    1. ALWAYS verify source availability before responding
    2. MUST include specific document references (BOE-A-YYYY-XXXXX format)
    3. Check both BOE and BORME when relevant
    4. Prioritize newest relevant publications
    5. Note any modifications or updates to previous regulations
    
    RESPONSE FORMAT:
    1. Legal Basis: [BOE/BORME reference with date]
    2. Summary: [Key points]
    3. Changes: [Recent modifications if any]
    4. Application: [Practical interpretation]
    5. References: [All relevant document IDs]
    
    Remember: Accuracy and currency of information are paramount. Always verify against official sources.
    `;

    const assistant = await openai.beta.assistants.create({
        name: "Spanish Legal Consultation Assistant BETA FAKE",
        instructions,
        model: "gpt-4o",
        tools: [
            {
                type: "function",
                function: {
                    name: "getBOESummary",
                    description: "Get BOE summary for a specific date",
                    parameters: {
                        type: "object",
                        properties: {
                            date: {
                                type: "string",
                                description: "Date in YYYY-MM-DD format"
                            }
                        },
                        required: ["date"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "getBORMESummary",
                    description: "Get BORME summary for a specific date",
                    parameters: {
                        type: "object",
                        properties: {
                            date: {
                                type: "string",
                                description: "Date in YYYY-MM-DD format"
                            }
                        },
                        required: ["date"]
                    }
                }
            }
        ]
    });

    return assistant.id;
}

// Main chat processing function
async function processChat(input, threadId, assistantId) {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });
    const legalApi = new LegalDocumentAPI();

    try {
        if (!threadId) {
            const thread = await openai.beta.threads.create();
            threadId = thread.id;
        }

        await openai.beta.threads.messages.create(threadId, {
            role: "user",
            content: input
        });

        const run = await openai.beta.threads.runs.create(threadId, {
            assistant_id: assistantId
        });

        let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
        while (runStatus.status !== "completed") {
            if (runStatus.status === "requires_action") {
                const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
                const toolOutputs = [];

                for (const toolCall of toolCalls) {
                    const args = JSON.parse(toolCall.function.arguments);
                    let result;

                    switch (toolCall.function.name) {
                        case "getBOESummary":
                            result = await legalApi.getBOESummary(new Date(args.date));
                            break;
                        case "getBORMESummary":
                            result = await legalApi.getBORMESummary(new Date(args.date));
                            break;
                    }

                    toolOutputs.push({
                        tool_call_id: toolCall.id,
                        output: JSON.stringify(result)
                    });
                }

                await openai.beta.threads.runs.submitToolOutputs(
                    threadId,
                    run.id,
                    { tool_outputs: toolOutputs }
                );
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
            runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
        }

        const messages = await openai.beta.threads.messages.list(threadId);
        return {
            response: messages.data[0].content[0].text.value,
            threadId
        };
    } catch (error) {
        console.error('Chat processing error:', error.message);
        throw error;
    }
}

// Test function
async function testAPI() {
    const api = new LegalDocumentAPI();
    
    // Test with specific dates
    const dates = [
        new Date('2024-05-29'), // Example date from API docs
        new Date() // Today
    ];

    for (const date of dates) {
        console.log(`\nTesting APIs for date: ${date.toISOString().split('T')[0]}`);
        
        // Test BOE
        console.log('\nTesting BOE API...');
        const boeResult = await api.getBOESummary(date);
        console.log('BOE Result:', JSON.stringify(boeResult, null, 2));

        // Test BORME
        console.log('\nTesting BORME API...');
        const bormeResult = await api.getBORMESummary(date);
        console.log('BORME Result:', JSON.stringify(bormeResult, null, 2));
    }
}

// Export the necessary functions and classes
export {
    LegalDocumentAPI,
    createLegalAssistant,
    processChat
};

// If running directly, test the API
// if (process.argv[1] === fileURLToPath(import.meta.url)) {
//     testAPI().catch(console.error);
// }













// import OpenAI from 'openai';
// import axios from 'axios';

// const API_CONFIG = {
//     BOE: {
//         baseUrl: 'https://boe.es/datosabiertos/api/boe',
//         endpoints: {
//             summary: '/sumario'
//         }
//     },
//     BORME: {
//         baseUrl: 'https://boe.es/datosabiertos/api/borme',
//         endpoints: {
//             summary: '/sumario'
//         }
//     }
// };

// class LegalDocumentAPI {
//     constructor() {
//         this.axiosInstance = axios.create({
//             timeout: 30000, // Increased timeout
//             headers: {
//                 'Accept': 'application/json',
//                 'User-Agent': 'Legal-Consultation-Bot/1.0' // Added user agent
//             },
//             validateStatus: status => status < 500 // Handle 4xx errors gracefully
//         });
//     }

//     formatDate(date) {
//         const d = new Date(date);
//         const year = d.getFullYear();
//         const month = String(d.getMonth() + 1).padStart(2, '0');
//         const day = String(d.getDate()).padStart(2, '0');
//         return `${year}${month}${day}`;
//     }

//     async getBOESummary(date) {
//         try {
//             console.log('Fetching BOE for date:', this.formatDate(date));

//             const response = await this.axiosInstance.get(
//                 `${API_CONFIG.BOE.baseUrl}${API_CONFIG.BOE.endpoints.summary}/${this.formatDate(date)}`
//             );

//             // Log raw response for debugging
//             console.log('BOE API Response Status:', response.status);
//             console.log('BOE API Response Headers:', response.headers);

//             if (response.status === 404) {
//                 console.log('No BOE publication found for date:', this.formatDate(date));
//                 return null;
//             }

//             if (response.status !== 200) {
//                 console.error('BOE API Error:', response.status, response.statusText);
//                 return null;
//             }

//             // Validate response structure
//             if (!response.data?.data?.sumario) {
//                 console.error('Invalid BOE response structure');
//                 return null;
//             }

//             return this.processBOEResponse(response.data);
//         } catch (error) {
//             console.error('BOE API Error:', error.message);
//             if (error.response) {
//                 console.error('BOE Error Details:', {
//                     status: error.response.status,
//                     headers: error.response.headers,
//                     data: error.response.data
//                 });
//             }
//             return null;
//         }
//     }

//     async getBORMESummary(date) {
//         try {
//             console.log('Fetching BORME for date:', this.formatDate(date));

//             const response = await this.axiosInstance.get(
//                 `${API_CONFIG.BORME.baseUrl}${API_CONFIG.BORME.endpoints.summary}/${this.formatDate(date)}`
//             );

//             // Log raw response for debugging
//             console.log('BORME API Response Status:', response.status);
//             console.log('BORME API Response Headers:', response.headers);

//             if (response.status === 404) {
//                 console.log('No BORME publication found for date:', this.formatDate(date));
//                 return null;
//             }

//             if (response.status !== 200) {
//                 console.error('BORME API Error:', response.status, response.statusText);
//                 return null;
//             }

//             // Validate response structure
//             if (!response.data?.data?.sumario) {
//                 console.error('Invalid BORME response structure');
//                 return null;
//             }

//             return this.processBORMEResponse(response.data);
//         } catch (error) {
//             console.error('BORME API Error:', error.message);
//             if (error.response) {
//                 console.error('BORME Error Details:', {
//                     status: error.response.status,
//                     headers: error.response.headers,
//                     data: error.response.data
//                 });
//             }
//             return null;
//         }
//     }

//     processBOEResponse(data) {
//         try {
//             const { sumario } = data.data;

//             // Enhanced validation
//             if (!sumario?.diario?.seccion) {
//                 console.warn('BOE response missing required fields');
//                 return null;
//             }

//             // Ensure seccion is always an array
//             const sections = Array.isArray(sumario.diario.seccion) ?
//                 sumario.diario.seccion : [sumario.diario.seccion];

//             return {
//                 type: 'BOE',
//                 date: sumario.metadatos?.fecha_publicacion,
//                 summary: {
//                     id: sumario.diario?.sumario_diario?.identificador,
//                     pdfUrl: sumario.diario?.sumario_diario?.url_pdf?.texto || sumario.diario?.sumario_diario?.url_pdf
//                 },
//                 sections: sections.map(section => {
//                     // Ensure departamento is always an array
//                     const departments = Array.isArray(section.departamento) ?
//                         section.departamento : section.departamento ? [section.departamento] : [];

//                     return {
//                         code: section.codigo,
//                         name: section.nombre,
//                         departments: departments.map(dept => ({
//                             code: dept.codigo,
//                             name: dept.nombre,
//                             items: this.extractItems(dept)
//                         }))
//                     };
//                 })
//             };
//         } catch (error) {
//             console.error('Error processing BOE response:', error);
//             return null;
//         }
//     }

//     processBORMEResponse(data) {
//         try {
//             const { sumario } = data.data;

//             // Enhanced validation
//             if (!sumario?.diario?.seccion) {
//                 console.warn('BORME response missing required fields');
//                 return null;
//             }

//             // Ensure seccion is always an array
//             const sections = Array.isArray(sumario.diario.seccion) ?
//                 sumario.diario.seccion : [sumario.diario.seccion];

//             return {
//                 type: 'BORME',
//                 date: sumario.metadatos?.fecha_publicacion,
//                 summary: {
//                     id: sumario.diario?.sumario_diario?.identificador,
//                     pdfUrl: sumario.diario?.sumario_diario?.url_pdf?.texto || sumario.diario?.sumario_diario?.url_pdf
//                 },
//                 sections: sections.map(section => ({
//                     code: section.codigo,
//                     name: section.nombre,
//                     items: (Array.isArray(section.item) ? section.item : section.item ? [section.item] : [])
//                         .map(item => ({
//                             id: item.identificador,
//                             title: item.titulo,
//                             pdfUrl: item.url_pdf?.texto || item.url_pdf,
//                             htmlUrl: item.url_html,
//                             xmlUrl: item.url_xml
//                         }))
//                 }))
//             };
//         } catch (error) {
//             console.error('Error processing BORME response:', error);
//             return null;
//         }
//     }

//     extractItems(container) {
//         try {
//             const items = [];

//             // Handle direct items
//             if (container.item) {
//                 const directItems = Array.isArray(container.item) ? container.item : [container.item];
//                 items.push(...directItems.map(item => ({
//                     id: item.identificador,
//                     control: item.control,
//                     title: item.titulo,
//                     pdfUrl: item.url_pdf?.texto || item.url_pdf,
//                     htmlUrl: item.url_html,
//                     xmlUrl: item.url_xml
//                 })));
//             }

//             // Handle epigraph items
//             if (container.epigrafe) {
//                 const epigraphs = Array.isArray(container.epigrafe) ? container.epigrafe : [container.epigrafe];
//                 epigraphs.forEach(ep => {
//                     if (ep.item) {
//                         const epItems = Array.isArray(ep.item) ? ep.item : [ep.item];
//                         items.push(...epItems.map(item => ({
//                             id: item.identificador,
//                             control: item.control,
//                             title: item.titulo,
//                             pdfUrl: item.url_pdf?.texto || item.url_pdf,
//                             htmlUrl: item.url_html,
//                             xmlUrl: item.url_xml,
//                             epigraph: ep.nombre
//                         })));
//                     }
//                 });
//             }

//             return items;
//         } catch (error) {
//             console.error('Error extracting items:', error);
//             return [];
//         }
//     }
// }

// async function createLegalAssistant() {
//     const openai = new OpenAI({
//         apiKey: process.env.OPENAI_API_KEY
//     });

//     const instructions = `
//     You are a specialized legal consultation assistant for Spanish law, with expertise in analyzing BOE (Boletín Oficial del Estado) and BORME (Boletín Oficial del Registro Mercantil) publications.

//     CORE CAPABILITIES:
//     1. Document Analysis
//        - Direct access to BOE and BORME publications
//        - Real-time information retrieval
//        - Cross-reference capability between documents

//     2. Query Processing
//        - Legal topic identification
//        - Context-aware search
//        - Temporal relevance understanding

//     3. Legal Framework Navigation
//        - Section-specific expertise (e.g., BOE sections I-V, BORME sections A-C)
//        - Department and category organization
//        - Modification tracking

//     4. Response Structure
//        - Primary source citations (BOE/BORME references)
//        - Chronological organization
//        - Clear practical implications

//     OPERATING RULES:
//     1. ALWAYS verify source availability before responding
//     2. MUST include specific document references (BOE-A-YYYY-XXXXX format)
//     3. Check both BOE and BORME when relevant
//     4. Prioritize newest relevant publications
//     5. Note any modifications or updates to previous regulations
    
//     RESPONSE FORMAT:
//     1. Legal Basis: [BOE/BORME reference with date]
//     2. Summary: [Key points]
//     3. Changes: [Recent modifications if any]
//     4. Application: [Practical interpretation]
//     5. References: [All relevant document IDs]
    
//     Remember: Accuracy and currency of information are paramount. Always verify against official sources.
//     `;

//     const assistant = await openai.beta.assistants.create({
//         name: "Spanish Legal Consultation Assistant BETA",
//         instructions,
//         model: "gpt-4o",
//         tools: [
//             {
//                 type: "function",
//                 function: {
//                     name: "getBOESummary",
//                     description: "Get BOE summary for a specific date",
//                     parameters: {
//                         type: "object",
//                         properties: {
//                             date: {
//                                 type: "string",
//                                 description: "Date in YYYY-MM-DD format"
//                             }
//                         },
//                         required: ["date"]
//                     }
//                 }
//             },
//             {
//                 type: "function",
//                 function: {
//                     name: "getBORMESummary",
//                     description: "Get BORME summary for a specific date",
//                     parameters: {
//                         type: "object",
//                         properties: {
//                             date: {
//                                 type: "string",
//                                 description: "Date in YYYY-MM-DD format"
//                             }
//                         },
//                         required: ["date"]
//                     }
//                 }
//             }
//         ]
//     });

//     return assistant.id;
// }

// // Main chat processing function
// async function processChat(input, threadId, assistantId) {
//     const openai = new OpenAI({
//         apiKey: process.env.OPENAI_API_KEY
//     });
//     const legalApi = new LegalDocumentAPI();

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
//             if (runStatus.status === "requires_action") {
//                 const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
//                 const toolOutputs = [];

//                 for (const toolCall of toolCalls) {
//                     const args = JSON.parse(toolCall.function.arguments);
//                     let result;

//                     switch (toolCall.function.name) {
//                         case "getBOESummary":
//                             result = await legalApi.getBOESummary(new Date(args.date));
//                             break;
//                         case "getBORMESummary":
//                             result = await legalApi.getBORMESummary(new Date(args.date));
//                             break;
//                     }

//                     toolOutputs.push({
//                         tool_call_id: toolCall.id,
//                         output: JSON.stringify(result)
//                     });
//                 }

//                 await openai.beta.threads.runs.submitToolOutputs(
//                     threadId,
//                     run.id,
//                     { tool_outputs: toolOutputs }
//                 );
//             }

//             await new Promise(resolve => setTimeout(resolve, 1000));
//             runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
//         }

//         const messages = await openai.beta.threads.messages.list(threadId);
//         return {
//             response: messages.data[0].content[0].text.value,
//             threadId
//         };
//     } catch (error) {
//         console.error('Chat processing error:', error.message);
//         throw error;
//     }
// }

// // Modified test function
// async function testAPI() {
//     const api = new LegalDocumentAPI();

//     // Test with multiple dates
//     const dates = [
//         new Date(), // Today
//         new Date(Date.now() - 86400000), // Yesterday
//         new Date(Date.now() - 86400000 * 2) // Day before yesterday
//     ];

//     for (const date of dates) {
//         console.log(`\nTesting APIs for date: ${date.toISOString().split('T')[0]}`);

//         // Test BOE
//         console.log('\nTesting BOE API...');
//         const boeResult = await api.getBOESummary(date);
//         if (boeResult) {
//             console.log('BOE Result:', JSON.stringify(boeResult, null, 2));
//         } else {
//             console.log('No BOE data available for this date');
//         }

//         // Test BORME
//         console.log('\nTesting BORME API...');
//         const bormeResult = await api.getBORMESummary(date);
//         if (bormeResult) {
//             console.log('BORME Result:', JSON.stringify(bormeResult, null, 2));
//         } else {
//             console.log('No BORME data available for this date');
//         }
//     }
// }

// // Run the test
// testAPI().catch(console.error);

// export {
//     LegalDocumentAPI,
//     createLegalAssistant,
//     processChat
// };