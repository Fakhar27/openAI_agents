import { LegalDocumentAPI } from "./prototype.js";
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// API Configuration
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

async function saveResponse(filename, data) {
    const filePath = path.join(__dirname, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log(`Saved response to ${filePath}`);
}

async function testAPI() {
    const api = new LegalDocumentAPI();

    // Test dates
    const dates = [
        new Date('2024-05-29'), // Example date from API docs
        new Date() // Today
    ];

    for (const date of dates) {
        const dateStr = date.toISOString().split('T')[0];
        console.log(`\nTesting APIs for date: ${dateStr}`);

        // Test BOE
        console.log('\nTesting BOE API...');
        try {
            const formattedDate = api.formatDate(date);
            const response = await api.axiosInstance.get(
                `${API_CONFIG.BOE.baseUrl}${API_CONFIG.BOE.endpoints.summary}/${formattedDate}`
            );

            // Save raw response
            await saveResponse(
                `boe_response_${dateStr}.json`,
                {
                    status: response.status,
                    headers: response.headers,
                    data: response.data
                }
            );

            console.log('BOE Raw Response:', response.data);

            // Process and save formatted response
            const processedResponse = await api.getBOESummary(date);
            if (processedResponse) {
                await saveResponse(
                    `boe_processed_${dateStr}.json`,
                    processedResponse
                );
                console.log('BOE Processed Response:', processedResponse);
            }
        } catch (error) {
            console.error('Error fetching BOE:', error.message);
            if (error.response) {
                console.error('Error Response:', error.response.data);
            }
            await saveResponse(
                `boe_error_${dateStr}.json`,
                {
                    error: error.message,
                    response: error.response?.data
                }
            );
        }

        // Test BORME
        console.log('\nTesting BORME API...');
        try {
            const formattedDate = api.formatDate(date);
            const response = await api.axiosInstance.get(
                `${API_CONFIG.BORME.baseUrl}${API_CONFIG.BORME.endpoints.summary}/${formattedDate}`
            );

            // Save raw response
            await saveResponse(
                `borme_response_${dateStr}.json`,
                {
                    status: response.status,
                    headers: response.headers,
                    data: response.data
                }
            );

            console.log('BORME Raw Response:', response.data);

            // Process and save formatted response
            const processedResponse = await api.getBORMESummary(date);
            if (processedResponse) {
                await saveResponse(
                    `borme_processed_${dateStr}.json`,
                    processedResponse
                );
                console.log('BORME Processed Response:', processedResponse);
            }
        } catch (error) {
            console.error('Error fetching BORME:', error.message);
            if (error.response) {
                console.error('Error Response:', error.response.data);
            }
            await saveResponse(
                `borme_error_${dateStr}.json`,
                {
                    error: error.message,
                    response: error.response?.data
                }
            );
        }
    }
}

// Run the test
testAPI().catch(console.error);