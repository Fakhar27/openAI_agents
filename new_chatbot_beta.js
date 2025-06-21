import OpenAI from 'openai';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import dotenv from 'dotenv';
import winston from 'winston';
import readline from 'readline';

// Load environment variables
dotenv.config();

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...rest }) => {
            return `${timestamp} [${level.toUpperCase()}]: ${message} ${Object.keys(rest).length ? JSON.stringify(rest, null, 2) : ''}`;
        })
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

// Tax types constants
const TAX_TYPES = {
    IVA: {
        id: 'BOE-A-1992-28740',
        name: 'IVA (Value Added Tax)',
        keywords: ['iva', 'vat', 'impuesto sobre el valor añadido', 'sales tax']
    },
    IRPF: {
        id: 'BOE-A-2006-20764',
        name: 'IRPF (Income Tax)',
        keywords: ['irpf', 'income tax', 'impuesto sobre la renta']
    }
};

class SpanishTaxBot {
    constructor(openaiApiKey) {
        this.openai = new OpenAI({ apiKey: openaiApiKey });
        this.xmlParser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
            textNodeName: "text"
        });
        this.assistantId = null;
    }

    async initialize() {
        try {
            logger.info('Initializing Spanish Tax Bot');
            const assistant = await this.createAssistant();
            this.assistantId = assistant.id;
            logger.info('Assistant initialized', { assistantId: this.assistantId });
            return true;
        } catch (error) {
            logger.error('Initialization failed:', error);
            throw error;
        }
    }

    async createAssistant() {
        logger.info('Creating/retrieving assistant');

        const assistants = await this.openai.beta.assistants.list({
            order: "desc",
            limit: "20"
        });

        const existingAssistant = assistants.data.find(
            a => a.name === "Spanish Tax Assistant ALPHA v2 (FREELANCERS)"
        );

        if (existingAssistant) {
            logger.info('Found existing assistant', { assistantId: existingAssistant.id });
            return existingAssistant;
        }

        const assistant = await this.openai.beta.assistants.create({
            name: "Spanish Tax Assistant ALPHA v2 (FREELANCERS)",
            model: "gpt-4o-mini",
            instructions: `Este asistente virtual se enfoca exclusivamente en:
IVA (Impuesto sobre el Valor Añadido)
IRPF (Impuesto sobre la Renta de las Personas Físicas)
Si la pregunta no se relaciona directamente con IVA o IRPF en España, debe rechazarla amablemente:
“Lo siento, solo ofrezco información sobre IVA e IRPF en España. ¿Tienes alguna otra pregunta sobre estos impuestos?”

2. Uso de Mayúsculas y Ortografía
Mayúsculas:
Emplear solo en el inicio de oración, siglas (IVA, IRPF), nombres propios (Ley del IVA, Ley del IRPF) y acrónimos.
Evitar mayúsculas en el resto del texto; seguir la ortografía y la puntuación del español.
Corrección:
Escribir con buena gramática y tildes, sin usar anglicismos innecesarios.
3. Modalidades de Respuesta (Conciso vs. Detallado)
Modo Conciso:

Dar respuestas breves y directas, sin listados extensos ni cálculos detallados.
Ejemplo: “Puedes deducir 173,55 € de IVA.”
Modo Detallado:

Incluir pasos de cálculo, ejemplos numéricos y referencias a artículos legales cuando sea necesario.
Utilizar encabezados o viñetas para mayor claridad.
Nota: Por defecto, el asistente opera en “Modo Detallado” si el usuario no especifica lo contrario. Si el usuario expresa “prefiero una respuesta breve” o “solo dame la cifra”, pasar al Modo Conciso.

4. Identificación Rápida del Problema
Determinar si la consulta corresponde a IVA o IRPF o ambos, y pedir clarificación si no está claro:

“¿Podrías especificar si tu consulta se refiere a la liquidación de IVA o a las retenciones de IRPF?”

Mencionar un artículo de la ley solo si es estrictamente necesario para la respuesta.

Evitar aportar datos superfluos o ajenos a la pregunta.

5. Cita y Referencias de la Ley
- Al citar artículos, usar SOLO este formato:
  "Según el artículo XX de la Ley del IVA/IRPF"
- Para referencias al BOE, usar SOLO:
  "Esta información está basada en el artículo XX de la Ley del IVA/IRPF"
- NUNCA incluir:
  * Enlaces a APIs
  * URLs del BOE
  * Enlaces técnicos
  * Endpoints
- Si el usuario pide la fuente, responder:
  "Esta información está disponible en el Boletín Oficial del Estado (BOE)

Evitar transcribir grandes bloques o citas extensas no requeridas.
6. Cálculos y Formato
Cálculos:
Mantenerlos concisos y claros, preferentemente en oraciones cortas.
Ejemplo:
“Base imponible: 10.000 €. Tipo: 21%. IVA = 2.100 €.”

Sin ejemplos extensos:
No incluir cálculos detallados a menos que el usuario los solicite expresamente.
En todo caso, respetar la regla “Modo Conciso” vs. “Modo Detallado.”
7. Manejo de Consultas Ambiguas o Múltiples
Ambigüedad:

Pedir al usuario más detalles:
“¿Podrías aclarar si tu duda es sobre liquidación de IVA o retenciones de IRPF?”

Múltiples preguntas:

Abordar cada tema de forma separada:
“Para responder con precisión, ¿podemos empezar por tu duda sobre [tema principal] y luego pasamos a lo siguiente?”

8. Referencias al BOE y Últimas Actualizaciones
Se considera que el asistente tiene acceso a la normativa más reciente del BOE, pero:
No proporcionar enlaces ni detalles técnicos (API, endpoints, etc.).
Si el usuario pide “últimas actualizaciones”, solicitar que especifique la ley o el tema concreto.
9. Consultas Fuera de Alcance
Si el usuario pregunta por asuntos distintos a IVA/IRPF:
“Lo siento, solo ofrezco información sobre IVA e IRPF en España. ¿Tienes alguna otra pregunta sobre estos impuestos?”

10. Manejo de Errores y Contradicciones
Artículo no localizado:
“No encuentro el artículo que mencionas. ¿Podrías verificar el número o la norma?”

Contradicciones:
“Parece haber una mezcla de conceptos. ¿Te refieres a operaciones de IVA o a IRPF? Acláramelo para poder ayudarte.”

11. Orientación Educada en Escenarios Complejos
Solicitar información mínima (tipo de actividad, periodo, gasto, etc.), manteniendo el enfoque en IVA e IRPF.
No profundizar en otras áreas legales (e.g., derecho laboral, seguridad social) u otras ramas de fiscalidad.
12. Idiomas
El asistente responde preferentemente en español.
Puede responder en otro idioma si el usuario lo solicita, advirtiendo que la mayor precisión se alcanza en español:
“Puedo intentar responder en [idioma], pero mi información es más precisa en español.”

13. Confidencialidad, Neutralidad y Detalles Técnicos
No pedir datos personales ni almacenar información sensible.
No revelar:
Código interno, implementación técnica, pila tecnológica, APIs.
Que usa modelos de lenguaje grandes, ChatGPT, OpenAI u otros.
No ofrecer enlaces externos o asesoría profesional externa: la información debe ser autosuficiente en el ámbito de IVA/IRPF.
Mantener neutralidad sin emitir opiniones personales sobre la ley ni sus reformas.
14. Manejo de Saludos y Respuestas Genéricas

Si el usuario inicia la conversación con un saludo o un mensaje genérico como "Hola" o "Hello", el asistente debe responder de manera amistosa y profesional:
“Hola, ¿cómo puedo ayudarte hoy con IVA o IRPF en España?”
Si el usuario no menciona IVA o IRPF en su mensaje posterior, seguir con la respuesta estándar: “Lo siento, solo ofrezco información sobre IVA e IRPF en España. ¿Tienes alguna otra pregunta sobre estos impuestos?`,
            tools: [{
                type: "function",
                function: {
                    name: "fetchTaxArticle",
                    description: "Fetches specific articles from Spanish tax laws",
                    parameters: {
                        type: "object",
                        properties: {
                            lawId: {
                                type: "string",
                                enum: Object.values(TAX_TYPES).map(tax => tax.id),
                                description: "The ID of the tax law to query"
                            },
                            articleId: {
                                type: "string",
                                description: "The article ID (e.g., 'a23' for Article 23)"
                            }
                        },
                        required: ["lawId", "articleId"]
                    }
                }
            }]
        });

        logger.info('Created new assistant', { assistantId: assistant.id });
        return assistant;
    }

    async fetchArticleFromIndex(lawId, articleNumber) {
        try {
            logger.info(`Fetching article from index`, { lawId, articleNumber });

            // Step 1: Get the index
            const indexUrl = `https://www.boe.es/datosabiertos/api/legislacion-consolidada/id/${lawId}/texto/indice`;
            logger.debug(`Requesting index from: ${indexUrl}`);

            const indexResponse = await axios.get(indexUrl, {
                headers: {
                    'Accept': 'application/xml',
                    'Cache-Control': 'no-cache'
                }
            });

            const indexData = this.xmlParser.parse(indexResponse.data);

            // Ensure we're accessing the blocks array correctly
            const blocks = Array.isArray(indexData.response.data.bloque)
                ? indexData.response.data.bloque
                : [indexData.response.data.bloque];

            // Step 2: Find the article block
            const articleId = `a${articleNumber}`;
            const articleBlock = blocks.find(block => block.id === articleId);

            if (!articleBlock) {
                logger.warn(`Article not found`, { lawId, articleNumber });
                throw new Error(`Article ${articleNumber} not found in law ${lawId}`);
            }

            // Step 3: Fetch the specific article
            const articleUrl = `https://www.boe.es/datosabiertos/api/legislacion-consolidada/id/${lawId}/texto/bloque/${articleId}`;
            logger.debug(`Requesting article from: ${articleUrl}`);

            const articleResponse = await axios.get(articleUrl, {
                headers: {
                    'Accept': 'application/xml',
                    'Cache-Control': 'no-cache'
                }
            });

            const articleData = this.xmlParser.parse(articleResponse.data);

            // Handle different possible XML structures
            const versions = articleData.response.data.bloque.version;
            const latestVersion = Array.isArray(versions)
                ? versions[versions.length - 1]
                : versions;

            logger.info(`Successfully fetched article`, {
                lawId,
                articleNumber,
                lastUpdated: articleBlock.fecha_actualizacion
            });

            // Return formatted article data
            return {
                title: articleBlock.titulo,
                content: latestVersion,
                lastUpdated: articleBlock.fecha_actualizacion,
                url: articleUrl // Include the URL for reference
            };
        } catch (error) {
            logger.error('Error fetching article:', {
                error: error.message,
                lawId,
                articleNumber,
                stack: error.stack
            });

            // Provide more specific error message
            if (error.response) {
                const status = error.response.status;
                if (status === 400) {
                    throw new Error(`Invalid request for article ${articleNumber}. Please check if the article exists.`);
                } else if (status === 404) {
                    throw new Error(`Article ${articleNumber} not found in the specified law.`);
                }
            }
            throw error;
        }
    }

    async handleFunctionCall(toolCall) {
        const { lawId, articleId } = JSON.parse(toolCall.function.arguments);
        const articleNumber = articleId.replace('a', '');
        logger.debug('Handling function call', {
            function: toolCall.function.name,
            lawId,
            articleId
        });
        return await this.fetchArticleFromIndex(lawId, articleNumber);
    }

    async processQuery(query) {
        try {
            logger.info('Processing query', { query });

            const thread = await this.openai.beta.threads.create({
                messages: [
                    {
                        role: "user",
                        content: query
                    }
                ]
            });

            logger.debug('Created thread', { threadId: thread.id });

            const run = await this.openai.beta.threads.runs.create(
                thread.id,
                { assistant_id: this.assistantId }
            );

            logger.debug('Created run', { runId: run.id });

            const response = await this.pollRunCompletion(thread.id, run.id);

            logger.info('Query processed successfully', {
                query,
                threadId: thread.id
            });

            return response;

        } catch (error) {
            logger.error('Error processing query:', {
                error: error.message,
                query
            });
            throw error;
        }
    }

    async pollRunCompletion(threadId, runId) {
        while (true) {
            const run = await this.openai.beta.threads.runs.retrieve(threadId, runId);
            logger.debug('Run status update', {
                threadId,
                runId,
                status: run.status
            });

            if (run.status === 'completed') {
                const messages = await this.openai.beta.threads.messages.list(threadId);
                return messages.data[0].content[0].text.value;
            }

            if (run.status === 'requires_action') {
                const toolCalls = run.required_action.submit_tool_outputs.tool_calls;
                const toolOutputs = [];

                for (const toolCall of toolCalls) {
                    if (toolCall.function.name === 'fetchTaxArticle') {
                        const output = await this.handleFunctionCall(toolCall);
                        toolOutputs.push({
                            tool_call_id: toolCall.id,
                            output: JSON.stringify(output)
                        });
                    }
                }

                await this.openai.beta.threads.runs.submitToolOutputs(
                    threadId,
                    runId,
                    { tool_outputs: toolOutputs }
                );
            }

            if (run.status === 'failed') {
                logger.error('Run failed', {
                    threadId,
                    runId,
                    error: run.last_error
                });
                throw new Error('Run failed: ' + run.last_error);
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// Interactive CLI
async function startInteractiveCLI(taxBot) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log('\nSpanish Tax Consultation Bot (Self-Employed Focus)');
    console.log('Type "exit" to quit the program');
    console.log('------------------------------------------------');

    const askQuestion = () => {
        rl.question('\nEnter your tax query: ', async (query) => {
            if (query.toLowerCase() === 'exit') {
                console.log('Thank you for using the Spanish Tax Consultation Bot!');
                rl.close();
                return;
            }

            try {
                console.log('\nProcessing your query...\n');
                const response = await taxBot.processQuery(query);
                console.log('Response:', response);
            } catch (error) {
                console.error('Error:', error.message);
            }

            askQuestion();
        });
    };

    askQuestion();
}

// Main function to run the application
async function main() {
    try {
        // Check for OpenAI API key
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY not found in environment variables');
        }

        // Initialize the tax bot
        const taxBot = new SpanishTaxBot(process.env.OPENAI_API_KEY);
        await taxBot.initialize();

        // Start interactive CLI
        await startInteractiveCLI(taxBot);

    } catch (error) {
        logger.error('Error:', error);
        process.exit(1);
    }
}

main();

















// `You are a Spanish tax consultant specializing in self-employed (autónomos) tax consultations.

// Process for Handling Queries:
// 1. First determine if the query is about IVA or IRPF
// 2. Search for relevant keywords and phrases
// 3. Request specific articles as needed
// 4. Provide detailed, practical answers

// Response Structure:
// 1. Type of Tax Involved (IVA or IRPF)
// 2. Legal Framework
//    - Relevant articles and sections
//    - Current regulations
// 3. Practical Application
//    - Step-by-step guidance
//    - Calculation examples when relevant
// 4. Additional Information
//    - Filing deadlines
//    - Required documentation
//    - Special considerations

// Self-Employed Focus:
// - Quarterly tax obligations
// - Applicable deductions
// - Registration requirements
// - Special schemes
// - Cross-border considerations

// Important Guidelines:
// - Only provide information from official BOE sources
// - Always cite specific articles
// - For complex cases, recommend professional consultation
// - Use the most recent version of tax laws
// - Be explicit about deadlines and requirements`,