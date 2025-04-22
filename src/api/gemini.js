import { GoogleGenerativeAI } from "@google/generative-ai";

export async function processTranscriptWithGemini(transcript, language) {
    if (!transcript) {
        throw new Error('Missing transcript');
    }

    // --- Inicializácia klienta AŽ TU, keď máme API kľúč z process.env ---
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("CHYBA: GEMINI_API_KEY nie je dostupný v process.env!");
        throw new Error("Missing Gemini API Key configuration on the server.");
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    // --- Koniec inicializácie klienta ---


    console.log(`Gemini Processor (${language}): Spracovávam "${transcript}"`);

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

        // --- Prompt (Použijeme ten vylepšený s príkladmi) ---
        let languageInstruction, examples;
        if (language && language.startsWith('en')) {
            languageInstruction = "Process the following English command";
            examples = `
Examples:
"cube 4 color blue" -> {"action": "setColor", "target": "Cube04", "axis": null, "value": "#007bff"}
"rotate cube 7 y 90" -> {"action": "setRotation", "target": "Cube07", "axis": "y", "value": 90}
"scale cube 8 to 1.5" -> {"action": "setScale", "target": "Cube08", "axis": "z", "value": 1.5}
"set cube 3 scale 2" -> {"action": "setScale", "target": "Cube03", "axis": "z", "value": 2}
"cube 5 size 0.7" -> {"action": "setScale", "target": "Cube05", "axis": "z", "value": 0.7}
"make cube 2 bigger" -> {"action": "setScale", "target": "Cube02", "axis": "z", "value": 1.2} // Príklad relatívnej zmeny
"make cube 1 smaller" -> {"action": "setScale", "target": "Cube01", "axis": "z", "value": 0.8} // Príklad relatívnej zmeny
"reset color for cube 6" -> {"action": "resetColor", "target": "Cube06", "axis": null, "value": null}
"cube 9 reset scale" -> {"action": "resetScale", "target": "Cube09", "axis": null, "value": null}
"reset cube 7 rotation" -> {"action": "resetRotation", "target": "Cube07", "axis": null, "value": null}
`;
        } else { // Slovenčina
            languageInstruction = "Spracuj nasledujúci slovenský príkaz";
            examples = `
Príklady:
"kocka 4 farba modrá" -> {"action": "setColor", "target": "Cube04", "axis": null, "value": "#007bff"}
"rotácia kocka 7 os y 90" -> {"action": "setRotation", "target": "Cube07", "axis": "y", "value": 90}
"mierka kocka 8 na 1.5" -> {"action": "setScale", "target": "Cube08", "axis": "z", "value": 1.5}
"nastav mierku kocky 3 na 2" -> {"action": "setScale", "target": "Cube03", "axis": "z", "value": 2}
"kocka 5 veľkosť 0.7" -> {"action": "setScale", "target": "Cube05", "axis": "z", "value": 0.7}
"zväčši kocku 2" -> {"action": "setScale", "target": "Cube02", "axis": "z", "value": 1.2} // Príklad relatívnej zmeny
"zmenši kocku 1" -> {"action": "setScale", "target": "Cube01", "axis": "z", "value": 0.8} // Príklad relatívnej zmeny
"reset farby pre kocku 6" -> {"action": "resetColor", "target": "Cube06", "axis": null, "value": null}
"kocka 9 reset mierky" -> {"action": "resetScale", "target": "Cube09", "axis": null, "value": null}
"kocka 7 reset rotácie" -> {"action": "resetRotation", "target": "Cube07", "axis": null, "value": null}
`;
        }
        const prompt = `
        ${languageInstruction} to control a 3D model composed of parts named "Cube01" through "Cube09".
        Extract the user's intent into a JSON object with keys: "action", "target", "axis", "value".
        
        Possible actions: "setColor", "resetColor", "setRotation", "resetRotation", "setScale", "resetScale", "unknown".
        Target format: "Cube" followed by a two-digit number (e.g., "Cube01", "Cube07"). Use null if no target.
        Axis format: "x" or "y" for setRotation. Axis MUST BE "z" for setScale. Use null otherwise.
        Value format: Hex color string for setColor, number for setRotation/setScale, null for resets. Convert spoken numbers to digits. If relative scale change like "bigger" or "smaller" is mentioned, use common factors like 1.2 for bigger and 0.8 for smaller as the value for setScale.
        
        ${examples}
        
        Strictly adhere to the JSON format {"action": "...", "target": "...", "axis": "...", "value": ...}. Respond ONLY with the JSON object, no extra text or markdown.

Command: "${transcript}"

JSON response:`;
        // --- Koniec promptu ---

        console.log("Gemini Processor: Sending prompt...");
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        console.log("Gemini Processor: Response Text:", text);

        try {
            const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
            const commandData = JSON.parse(cleanedText);
            console.log("Gemini Processor: Parsed Command Data:", commandData);
            if (!commandData || typeof commandData.action === 'undefined') {
                console.error("Gemini Processor: Invalid JSON structure:", commandData);
                return { action: "unknown", target: null, axis: null, value: "Invalid AI response structure" };
            }
            return commandData; // Vrátime úspešne spracované dáta
        } catch (parseError) {
            console.error('Gemini Processor: Error parsing JSON:', parseError);
            console.error('Gemini Processor: Original text:', text);
            return { action: "unknown", target: null, axis: null, value: "AI response parse error" };
        }

    } catch (error) {
        console.error('Gemini Processor: Error calling Gemini API:', error);
        // Vyhodíme chybu, ktorú zachytí middleware vo vite.config.js
        throw new Error('Failed to process command with AI');
    }
}
