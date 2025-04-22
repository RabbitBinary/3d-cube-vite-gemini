// vite.config.js
import { defineConfig } from 'vite';
import dns from 'dns';
import dotenv from 'dotenv'; // <<< Import dotenv na začiatku

// --- Import našej funkcie z src/api/gemini.js ---
import { processTranscriptWithGemini } from './src/api/gemini.js';

// --- Načítanie .env HNEĎ TU ---
// Načíta premenné z .env v koreňovom adresári do process.env
dotenv.config();
// --- Koniec načítania .env ---

dns.setDefaultResultOrder('verbatim');

export default defineConfig({
    server: {
        host: 'localhost',
        port: 5173, // Alebo váš port
        // Proxy už nepoužívame
    },
    plugins: [
        {
            name: 'vite-plugin-custom-api', // Názov pluginu
            configureServer(server) {
                console.log('Custom API Middleware Plugin Loaded.'); // Log pre kontrolu

                // Použitie server.middlewares.use na pridanie našej logiky
                server.middlewares.use(async (req, res, next) => {
                    // Spracujeme len POST /api/process-voice
                    if (req.method === 'POST' && req.url === '/api/process-voice') {
                        console.log('API Middleware: Request received for /api/process-voice');

                        // Načítanie tela požiadavky
                        let body = '';
                        req.on('data', chunk => { body += chunk.toString(); });

                        // Keď je telo načítané
                        req.on('end', async () => {
                            try {
                                const requestData = JSON.parse(body);
                                const transcript = requestData.transcript;
                                const language = requestData.language || 'sk-SK';

                                if (!transcript) {
                                    console.log('API Middleware: Missing transcript.');
                                    res.writeHead(400, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: 'Missing transcript' }));
                                    return;
                                }

                                // <<< VOLANIE NAŠEJ FUNKCIE Z gemini.js >>>
                                const commandData = await processTranscriptWithGemini(transcript, language);

                                console.log('API Middleware: Sending response:', commandData);
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify(commandData));

                            } catch (error) {
                                // Zachytenie chýb z JSON.parse alebo processTranscriptWithGemini
                                console.error('API Middleware: Error processing request:', error);
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                // Pošleme chybovú správu, ktorú vyhodila naša funkcia alebo parsovanie
                                res.end(JSON.stringify({ error: error.message || 'Internal Server Error' }));
                            }
                        });
                    } else {
                        // Ak to nie je naša cesta, posunieme ďalej
                        next();
                    }
                });
            }
        }
    ]
});