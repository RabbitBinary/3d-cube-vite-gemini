// vite.config.js
import { defineConfig } from "vite";
import dns from "dns";
import dotenv from "dotenv"; // Import

dotenv.config(); // <<< Načítanie .env HNEĎ TU

// Import našej funkcie
import { processTranscriptWithGemini } from "./src/api/gemini.js"; // <<< Skontrolujte cestu

dns.setDefaultResultOrder("verbatim");

export default defineConfig({
  server: {
    host: "localhost",
    port: 5173, // Alebo váš port
  },
  plugins: [
    {
      name: "vite-plugin-custom-api",
      configureServer(server) {
        console.log("Custom API Middleware Plugin Loaded.");
        const geminiApiKey = process.env.GEMINI_API_KEY; // <<< Načítanie kľúča TU
        if (!geminiApiKey) {
          console.error("!!! CHYBA: GEMINI_API_KEY nenájdený v .env !!!");
        } else {
          console.log("API kľúč pre Gemini načítaný.");
        }

        server.middlewares.use(async (req, res, next) => {
          if (req.method === "POST" && req.url === "/api/process-voice") {
            console.log("API Middleware: Request received...");
            let body = "";
            req.on("data", (chunk) => {
              body += chunk.toString();
            });
            req.on("end", async () => {
              try {
                const requestData = JSON.parse(body);
                const transcript = requestData.transcript;
                const language = requestData.language || "sk-SK";

                if (!transcript) {
                  /*...*/ res.writeHead(400, {
                    "Content-Type": "application/json",
                  });
                  res.end(JSON.stringify({ error: "Missing transcript" }));
                  return;
                }
                if (!geminiApiKey) {
                  throw new Error("API key not loaded.");
                }

                // <<< VOLANIE FUNKCIE S API KĽÚČOM >>>
                const commandData = await processTranscriptWithGemini(
                  transcript,
                  language,
                  geminiApiKey
                ); // <<< ODVZADÁVAME KĽÚČ

                console.log("API Middleware: Sending response:", commandData);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(commandData));
              } catch (error) {
                /* ... handle error ... */
              }
            });
          } else {
            next();
          }
        });
      },
    },
  ],
});
