import { GoogleGenerativeAI } from "@google/generative-ai";

// Funkcia prijíma apiKey ako argument
export async function processTranscriptWithGemini(
  transcript,
  language,
  apiKey
) {
  if (!transcript) {
    throw new Error("Missing transcript");
  }
  // Kontrola API kľúča
  if (!apiKey) {
    console.error("GEMINI PROCESSOR CHYBA: API kľúč nebol poskytnutý funkcii!");
    throw new Error("Missing Gemini API Key in processing function.");
  }

  // Inicializácia klienta s poskytnutým kľúčom
  const genAI = new GoogleGenerativeAI(apiKey);

  console.log(`Gemini Processor (${language}): Spracovávam "${transcript}"`);

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
    });
    let languageInstruction, examples;

    // --- Prompt žiadajúci NÁZOV FARBY a os 'z' pre mierku ---
    if (language && language.startsWith("en")) {
      languageInstruction = "Process the following English command";
      examples = `
Examples:
"cube 07 green" -> {"action": "setColor", "target": "Cube07", "axis": null, "value": "green"}
"cube 04 color blue" -> {"action": "setColor", "target": "Cube04", "axis": null, "value": "blue"}
"make cube 01 green" -> {"action": "setColor", "target": "Cube01", "axis": null, "value": "green"}
"cube 07 y 90" -> {"action": "setRotation", "target": "Cube07", "axis": "y", "value": 90}
"cube 02 x 60" -> {"action": "setRotation", "target": "Cube02", "axis": "x", "value": 60}
"cube 05 z 2" -> {"action": "setScale", "target": "Cube05", "axis": "z", "value": 2}
"set cube 03 scale 2" -> {"action": "setScale", "target": "Cube03", "axis": "z", "value": 2}
"cube 05 size 1.5" -> {"action": "setScale", "target": "Cube05", "axis": "z", "value": 1.5}
"cube 06 reset color" -> {"action": "resetColor", "target": "Cube06", "axis": null, "value": null}
"cube 09 reset scale" -> {"action": "resetScale", "target": "Cube09", "axis": null, "value": null}
"cube 07 reset rotation" -> {"action": "resetRotation", "target": "Cube07", "axis": null, "value": null}
`;
    } else {
      // Slovenčina
      languageInstruction = "Spracuj nasledujúci slovenský príkaz";
      examples = `
Príklady:
"kocka 02 oranžová" -> {"action": "setColor", "target": "Cube02", "axis": null, "value": "oranžová"}
"kocka 04 farba modrá" -> {"action": "setColor", "target": "Cube04", "axis": null, "value": "modrá"}
"kocka 06 bude zelená" -> {"action": "setColor", "target": "Cube06", "axis": null, "value": "zelená"}
"daj kocku 01 na zelenú" -> {"action": "setColor", "target": "Cube01", "axis": null, "value": "zelená"}
"kocka 07 y 90" -> {"action": "setRotation", "target": "Cube07", "axis": "y", "value": 90}
"kocka 02 x 50" -> {"action": "setRotation", "target": "Cube02", "axis": "x", "value": 50}
"kocka 08 z 1.5" -> {"action": "setScale", "target": "Cube08", "axis": "z", "value": 1.5}
"nastav mierku kocky 03 na 2" -> {"action": "setScale", "target": "Cube03", "axis": "z", "value": 2}
"kocka 05 veľkosť 1.2" -> {"action": "setScale", "target": "Cube05", "axis": "z", "value": 1.2}
"kocka 06 reset farby" -> {"action": "resetColor", "target": "Cube06", "axis": null, "value": null}
"kocka 09 reset mierky" -> {"action": "resetScale", "target": "Cube09", "axis": null, "value": null}
"kocka 07 reset rotácie" -> {"action": "resetRotation", "target": "Cube07", "axis": null, "value": null}
`;
    }

    const prompt = `
${languageInstruction} to control a 3D model composed of parts named "Cube01" through "Cube09".
Extract the user's intent into a JSON object with keys: "action", "target", "axis", "value".

Possible actions: "setColor", "resetColor", "setRotation", "resetRotation", "setScale", "resetScale", "unknown".
Target format: "Cube" followed by a two-digit number (e.g., "Cube01", "Cube07"). Use null if no target.
Axis format: "x" or "y" for setRotation. Axis MUST BE "z" for setScale. Use null for setColor, resetColor, resetRotation, resetScale.
Value format: For setColor, return the COLOR NAME mentioned (e.g., "blue", "green", "modrá"). For setRotation/setScale, return the number. Null for resets. If relative scale change like "bigger" or "smaller" is mentioned, use common factors like 1.2 for bigger and 0.8 for smaller as the value for setScale.

${examples}

Strictly adhere to the JSON format {"action": "...", "target": "...", "axis": "...", "value": ...}. Respond ONLY with the JSON object.

Command: "${transcript}"

JSON response:`;

    console.log("Gemini Processor: Sending prompt...");
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response?.text()?.trim();
    console.log("Gemini Processor: Response Text:", text);

    if (!text) {
      console.error(
        "Gemini Processor: Received empty or invalid response text from AI."
      );
      return {
        action: "unknown",
        target: null,
        axis: null,
        value: "Empty or invalid AI response",
      };
    }

    try {
      const cleanedText = text.replace(/```json\n?|\n?```/g, "").trim();
      if (!cleanedText) {
        console.error("Gemini Processor: Cleaned response text is empty.");
        return {
          action: "unknown",
          target: null,
          axis: null,
          value: "Cleaned AI response empty",
        };
      }
      const commandData = JSON.parse(cleanedText);
      console.log("Gemini Processor: Parsed:", commandData);

      if (!commandData || typeof commandData.action === "undefined") {
        console.error("Gemini Processor: Invalid JSON structure:", commandData);
        return {
          action: "unknown",
          target: null,
          axis: null,
          value: "Invalid AI response structure",
        };
      }

      // --- Záložná Normalizácia/Validácia Targetu na Cube0X ---
      if (commandData.target && typeof commandData.target === "string") {
        const targetMatch = commandData.target.match(/^Cube(\d{1,2})$/i);
        if (targetMatch && targetMatch[1]) {
          const num = parseInt(targetMatch[1], 10);
          if (!isNaN(num)) {
            const normalizedTarget = `Cube${num.toString().padStart(2, "0")}`;
            if (commandData.target !== normalizedTarget)
              console.log(
                `Normalizing target: ${commandData.target} -> ${normalizedTarget}`
              );
            commandData.target = normalizedTarget;
          } else {
            console.warn(
              `Gemini Processor: Failed to parse number from target "${commandData.target}". Setting action to unknown.`
            );
            commandData.action = "unknown";
            commandData.target = null;
          }
        } else {
          console.warn(
            `Gemini Processor: Returned unexpected target format: "${commandData.target}". Setting action to unknown.`
          );
          commandData.action = "unknown";
          commandData.target = null;
        }
      } else if (
        commandData.target !== null &&
        commandData.action !== "unknown" &&
        !commandData.action.startsWith("reset")
      ) {
        console.warn(
          `Gemini Processor: Returned null target for action: ${commandData.action}. Setting action to unknown.`
        );
        commandData.action = "unknown";
        commandData.target = null;
      }
      // Ak normalizácia nastavila action na unknown, vrátime to HNEĎ
      if (commandData.action === "unknown") {
        console.warn(
          "Action set to unknown due to target normalization/validation failure."
        );
        // Opravený return
        return {
          action: "unknown",
          target: null,
          axis: null,
          value: "Target normalization/validation failed",
        };
      }

      // --- Záložná kontrola osi pre setScale ---
      if (commandData.action === "setScale" && commandData.axis !== "z") {
        console.warn(
          `Forcing axis to 'z' for setScale (was ${commandData.axis})`
        );
        commandData.axis = "z";
      }
      // --- KONIEC Kontroly osi ---

      console.log("Gemini Processor: Returning final:", commandData);
      return commandData; // value pre setColor je teraz názov farby
    } catch (parseError) {
      console.error("Gemini Processor: Error parsing JSON:", parseError);
      console.error("Gemini Processor: Original text from AI:", text);
      return {
        action: "unknown",
        target: null,
        axis: null,
        value: "AI response parse error",
      };
    }
  } catch (error) {
    console.error("Gemini Processor: Error calling Gemini API:", error);
    throw new Error("Failed to process command with AI"); // Chybu necháme prejsť do middleware
  }
}
