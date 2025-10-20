import "./style.css";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import TWEEN from "@tweenjs/tween.js";
import { initializePopups } from './ui/popups.js';

const MOBILE_BREAKPOINT = 768;
const DESKTOP_CAMERA_Z = 9;
const MOBILE_CAMERA_Z = 12;
const DESKTOP_MODEL_Y = 2;
const MOBILE_MODEL_Y = 3;
let cameraTween = null; 
let modelPositionTween = null;

// --- Základné nastavenia ---
const canvas = document.querySelector("#webgl-canvas");
const scene = new THREE.Scene();

// --- UI Elementy ---
const loadingOverlay = document.getElementById("loading-overlay");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const micButton = document.getElementById("mic-button");
const micStatus = document.getElementById("mic-status");
const transcriptOutput = document.getElementById("transcript-output");
const cubeSelector = document.getElementById("cube-selector");
const selectedCubeColorsContainer = document.getElementById(
  "selected-cube-colors"
);
const selectedCubeTransformsContainer = document.getElementById(
  "selected-cube-transforms"
);
const environmentSelector = document.getElementById("environment-selector");
const languageSelector = document.getElementById("language-selector");

// Elementy pre popup
const aboutButton = document.getElementById("about-button");
const aboutPopup = document.getElementById("about-popup");
const closePopupButton = document.getElementById("close-popup-button");

// --- Kamera ---
const sizes = { width: window.innerWidth, height: window.innerHeight };
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 1000);
// <<< ZMENA: Nastavenie počiatočnej Z pozície podľa šírky okna >>>
const initialZ = window.innerWidth <= MOBILE_BREAKPOINT ? MOBILE_CAMERA_Z : DESKTOP_CAMERA_Z;
camera.position.set(0, 1.8, initialZ);
console.log(`Initial camera Z position set to: ${initialZ}`);
scene.add(camera);

// --- Premenné ---
let model = null;
let hdriTexture = null;
let modelParts = {};
let initialRotations = {};
let initialScales = {};
const defaultPartColor = new THREE.Color(0xffffff);

// --- Paleta farieb ---
const colorPalette = {
  blue: "#007bff",
  orange: "#fd7e14",
  purple: "#6f42c1",
  green: "#28a745",
  pink: "#e83e8c",
  yellow: "#ffc107",
  teal: "#20c997",
};

// --- Mapovanie názvov ---
const customPartDisplayNames = {
  Cube01: "Cube 1",
  Cube02: "Cube 2",
  Cube03: "Cube 3",
  Cube04: "Cube 4",
  Cube06: "Cube 6",
  Cube07: "Cube 7",
  Cube08: "Cube 8",
  Cube09: "Cube 9",
};

// --- Mapovanie prostredí ---
const environmentMaps = {
  "Green Farm": "enviroment/belfast_farmhouse_4k.hdr",
  "Autumn Landscape": "enviroment/belfast_sunset_4k.hdr",
  "Sunny Meadow": "enviroment/hilly_terrain_01_4k.hdr",
  "Starry Night": "enviroment/rogland_clear_night_4k.hdr",
  "Urban Street": "enviroment/canary_wharf_4k.hdr",
};
const defaultEnvironmentKey = "Green Farm";
let currentEnvironmentRotation = THREE.MathUtils.degToRad(180);

// --- Premenné pre Loader ---
let modelProgress = 0,
  hdriProgress = 0;
const modelWeight = 0.7,
  hdriWeight = 0.3;
let isModelLoaded = false,
  isHdriLoaded = false;

// --- Premenné pre Raycasting a Výber ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let currentlySelectedMesh = null;
const highlightColor = new THREE.Color(0xffffff);
const highlightIntensity = 0.15;

// --- Funkcie pre Loader ---
function updateCombinedProgress() {
  const combined = modelProgress * modelWeight + hdriProgress * hdriWeight;
  const percentage = Math.min(Math.round(combined * 100), 100);
  if (progressBar) progressBar.style.width = `${percentage}%`;
  if (progressText) progressText.textContent = `Loading scene ${percentage}%`;
}
function checkLoadingComplete(forceHide = false) {
  if (loadingOverlay && (forceHide || (isModelLoaded && isHdriLoaded))) {
    console.log("Načítavanie dokončené.");
    if (progressBar) progressBar.style.width = "100%";
    if (progressText) progressText.textContent = `Ready 100%`;
    setTimeout(() => {
      loadingOverlay.classList.add("hidden");
    }, 150);
  }
}

// --- Funkcia na aplikáciu/aktualizáciu skleneného materiálu (BEZ castShadow) ---
function applyGlassMaterial(targetModel, envMap) {
  if (!targetModel) return;
  targetModel.traverse((child) => {
    if (child.isMesh) {
      const currentMaterialColor =
        child.material && child.material.color
          ? child.material.color.clone()
          : defaultPartColor.clone();
      const currentEmissive =
        currentlySelectedMesh === child
          ? highlightColor.clone()
          : new THREE.Color(0x000000);
      const currentEmissiveIntensity =
        currentlySelectedMesh === child ? highlightIntensity : 0;
      if (child.material && child.material.dispose) {
        child.material.dispose();
      }
      const glassMaterial = new THREE.MeshPhysicalMaterial({
        color: currentMaterialColor,
        metalness: 0.4,
        roughness: 0.05,
        transmission: 0.5,
        ior: 1.52,
        thickness: 1.0,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.DoubleSide,
        envMap: envMap,
        envMapIntensity: 1.5,
        emissive: currentEmissive,
        emissiveIntensity: currentEmissiveIntensity,
      });
      child.material = glassMaterial;
      child.renderOrder = 1;
    }
  });
}

// Funkcia na úpravu pozície kamery podľa šírky ---
function adjustCameraPosition() {
  const currentZ = camera.position.z;
  const targetZ = window.innerWidth <= MOBILE_BREAKPOINT ? MOBILE_CAMERA_Z : DESKTOP_CAMERA_Z;

  // Ak sa cieľ líši a animácia nebeží
  if (Math.abs(currentZ - targetZ) > 0.1 && !cameraTween) {
      console.log(`Adjusting camera Z from ${currentZ.toFixed(1)} to ${targetZ}`);

      // Zastavíme akýkoľvek existujúci tween (pre istotu)
      if (cameraTween) cameraTween.stop();

      // Vytvoríme a spustíme nový tween
      cameraTween = new TWEEN.Tween(camera.position)
          .to({ z: targetZ }, 400) // Animujeme len Z súradnicu
          .easing(TWEEN.Easing.Quadratic.Out)
          .onComplete(() => {
              cameraTween = null; // Vynulujeme po skončení
              console.log(`Camera Z adjustment complete. Now at: ${camera.position.z.toFixed(1)}`);
          })
          .start(); // <<< Spustíme tween
  } else if (Math.abs(currentZ - targetZ) <= 0.1 && cameraTween) {
       // Ak sme už blízko cieľa a tween stále existuje, zastavíme ho
      cameraTween.stop();
      cameraTween = null;
  }
}

// --- Funkcia na načítanie prostredia ---
const rgbeLoader = new RGBELoader();
function loadEnvironment(hdriPath, rotationRadians, isInitialLoad = false) {
  if (!hdriPath) {
    console.warn("Nebola poskytnutá cesta k HDRI.");
    return;
  }
  console.log(
    `${isInitialLoad ? "Počiatočné n" : "N"}ačítavam prostredie: ${hdriPath}`
  );
  if (!isInitialLoad && loadingOverlay) {
    isHdriLoaded = false;
    hdriProgress = 0;
    updateCombinedProgress();
    loadingOverlay.classList.remove("hidden");
    console.log("Zobrazujem loader pre zmenu prostredia...");
  }
  rgbeLoader.load(
    hdriPath,
    (newTexture) => {
      console.log("Nové prostredie načítané.");
      newTexture.mapping = THREE.EquirectangularReflectionMapping;
      newTexture.center.set(0.5, 0.5);
      newTexture.rotation = rotationRadians;
      currentEnvironmentRotation = rotationRadians;
      newTexture.needsUpdate = true;
      scene.background = newTexture;
      scene.environment = newTexture;
      hdriTexture = newTexture;
      if (model) {
        applyGlassMaterial(model, hdriTexture);
      }
      console.log("Nové prostredie aplikované.");
      isHdriLoaded = true;
      hdriProgress = 1.0;
      updateCombinedProgress();
      checkLoadingComplete();
    },
    (xhr) => {
      if (!isHdriLoaded) {
        if (xhr.lengthComputable && xhr.total > 0) {
          hdriProgress = xhr.loaded / xhr.total;
        } else {
          hdriProgress = Math.min(hdriProgress + 0.05, 0.95);
        }
        updateCombinedProgress();
      }
    },
    (error) => {
      console.error(`Chyba pri načítavaní prostredia ${hdriPath}:`, error);
      if (isInitialLoad) {
        scene.background = new THREE.Color(0x444444);
      }
      hdriTexture = null;
      isHdriLoaded = true;
      hdriProgress = 1.0;
      updateCombinedProgress();
      if (model) {
        applyGlassMaterial(model, null);
      }
      checkLoadingComplete(true);
    }
  );
}

// --- Načítanie POČIATOČNÉHO HDRI ---
const initialHdriPath = environmentMaps[defaultEnvironmentKey];
if (initialHdriPath) {
  loadEnvironment(initialHdriPath, currentEnvironmentRotation, true);
} else {
  console.error("Chyba: Defaultný HDRI path!");
  scene.background = new THREE.Color(0x444444);
  isHdriLoaded = true;
  hdriProgress = 1.0;
  updateCombinedProgress();
  checkLoadingComplete();
}

// --- Osvetlenie (BEZ castShadow) ---
const ambientLight = new THREE.AmbientLight(0xffd63a, 1.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7); // Stále dôležité pre smer svetla

scene.add(directionalLight);
const pointLight = new THREE.PointLight(0xffffff, 1.0, 100);
scene.add(pointLight);

// --- Renderer (BEZ shadowMap) ---
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// === LOGIKA PRE HLASOVÉ OVLÁDANIE ===
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;
const BACKEND_URL = "/api/process-voice";
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript.trim();
    const currentLang = recognition.lang || languageSelector?.value || "sk-SK";
    console.log(`Recognized text (${currentLang}):`, transcript);
    if (transcript) {
      console.log("Recognized text:", transcript);
      if (transcriptOutput)
        transcriptOutput.textContent = `Recognized text: ${transcript}`;
      if (micStatus) micStatus.textContent = "Processing...";
      try {
        const response = await fetch(BACKEND_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: transcript }),
        });
        if (!response.ok) {
          let errorData;
          try {
            errorData = await response.json();
          } catch (e) {
            errorData = { error: `HTTP chyba: ${response.status}` };
          }
          throw new Error(errorData.error || `HTTP chyba: ${response.status}`);
        }
        const commandData = await response.json();
        console.log("Prijaté dáta z backendu:", commandData);
        executeCommandFromAI(commandData);
      } catch (error) {
        console.error("Chyba komunikácie s backendom:", error);
        if (micStatus) micStatus.textContent = `Chyba backendu`;
        setTimeout(() => {
          if (!isListening && micStatus) micStatus.textContent = "Ready";
        }, 2000);
      }
    }
  };
  recognition.onerror = (event) => {
    console.error("Chyba SpeechRecognition:", event.error);
    let message = `Chyba: ${event.error}`;
    if (event.error === "not-allowed") {
      message = "Prístup k mikrofónu bol zamietnutý.";
    } else if (event.error === "no-speech") {
      message = "Ticho... Skúste znova.";
    }
    if (micStatus) micStatus.textContent = message;
  };
  recognition.onend = () => {
    isListening = false;
    if (micButton) micButton.classList.remove("listening");
    if (micStatus && micStatus.textContent.startsWith("Rozumiem...")) {
      micStatus.textContent = "Pripravený";
    } else if (!micStatus.textContent.startsWith("Chyba")) {
      if (micStatus) micStatus.textContent = "Pripravený";
    }
  };
  function startListening() {
    if (!isListening && recognition) {
      try {
        if (languageSelector) {
          recognition.lang = languageSelector.value; // Získa hodnotu z HTML <select>
          console.log(`Starting recognition in ${recognition.lang}`);
        } else {
          recognition.lang = "sk-SK"; // Fallback, ak selector neexistuje
          console.warn("Language selector not found, defaulting to sk-SK");
        }
        recognition.start();
        isListening = true;
        if (micButton) micButton.classList.add("listening");
        if (micStatus) micStatus.textContent = "Počúvam...";
        if (transcriptOutput)
          transcriptOutput.textContent = "Rozpoznaný text: ---";
      } catch (e) {
        console.error("Nepodarilo sa spustiť rozpoznávanie:", e);
        if (micStatus) micStatus.textContent = "Chyba štartu";
        isListening = false;
        if (micButton) micButton.classList.remove("listening");
      }
    }
  }
  function stopListening() {
    if (isListening && recognition) {
      recognition.stop();
      isListening = false;
      if (micButton) micButton.classList.remove("listening");
      if (micStatus) micStatus.textContent = "Pripravený";
    }
  }
  if (micButton) {
    micButton.addEventListener("click", () => {
      if (isListening) {
        stopListening();
      } else {
        startListening();
      }
    });
  }
} else {
  console.warn("Web Speech API nie je podporované.");
  if (micStatus) micStatus.textContent = "Nepodporované";
  if (micButton) micButton.disabled = true;
}

const voiceColorPalette = {
  modrá: "#007bff",
  oranžová: "#fd7e14",
  fialová: "#6f42c1",
  zelená: "#28a745",
  ružová: "#e83e8c",
  žltá: "#ffc107",
  tyrkysová: "#20c997",
  biela: "#ffffff",
  blue: "#007bff",
  orange: "#fd7e14",
  purple: "#6f42c1",
  green: "#28a745",
  pink: "#e83e8c",
  yellow: "#ffc107",
  teal: "#20c997",
  white: "#ffffff",
};

// Funkcia na vykonanie príkazu z AI (s automatickým výberom UI a normalizáciou cieľa)
function executeCommandFromAI(commandData) {
  // 1. Validácia základných dát
  if (!commandData || !commandData.action) {
    console.warn("Prijaté neplatné dáta príkazu z AI:", commandData);
    if (micStatus) micStatus.textContent = "Neplatná AI odpoveď";
    setTimeout(() => {
      if (!isListening && micStatus) micStatus.textContent = "Pripravený";
    }, 1500);
    return;
  }

  // Použijeme 'let', aby sme mohli target upraviť
  let { action, target, axis, value } = commandData;
  const originalTarget = target; // Uchováme pôvodný pre logovanie chýb

  // --- Normalizácia cieľa (target) ---
  if (target && typeof target === "string") {
    // Hľadáme vzor "Cube" nasledovaný číslom (^Cube(\d+)$)
    // i - ignoruje veľkosť písmen (case-insensitive)
    const match = target.match(/^Cube(\d+)$/i);
    if (match && match[1]) {
      // Ak nájdeme zhodu a číslo
      const number = parseInt(match[1], 10); // Prevedieme číslo na integer
      if (!isNaN(number)) {
        // Skontrolujeme, či je to platné číslo
        // Formátujeme číslo na dve miesta s úvodnou nulou (napr. 4 -> "04")
        const formattedTarget = `Cube${number.toString().padStart(2, "0")}`;
        // Logujeme zmenu pre kontrolu
        console.log(
          `Normalizujem cieľ z "${originalTarget}" na "${formattedTarget}"`
        );
        target = formattedTarget; // <<< Prepíšeme premennú target normalizovanou hodnotou
      } else {
        console.warn(`Nepodarilo sa parsovať číslo z cieľa: ${originalTarget}`);
      }
    } else {
      console.log(
        `Cieľ "${target}" nezodpovedá formátu "Cube[číslo]", normalizácia preskočená.`
      );
    }
  }
  // --- KONIEC Normalizácie ---

  // 2. Validácia cieľa (teraz už s potenciálne normalizovaným 'target')
  // Kontrolujeme, či akcia vyžaduje cieľ a či tento cieľ existuje v našom modeli
  const requiresTarget = !["unknown"].includes(action); // 'unknown' nepotrebuje cieľ
  if (requiresTarget && (!target || !modelParts[target])) {
    // Používame už upravený 'target'
    console.warn(
      `AI vrátila neznámy alebo neexistujúci cieľ: ${originalTarget} (normalizovaný: ${target}) pre akciu ${action}`
    );
    if (micStatus)
      micStatus.textContent = `Neznáma časť: ${originalTarget || "žiadna"}`; // Zobrazíme pôvodný
    setTimeout(() => {
      if (!isListening && micStatus) micStatus.textContent = "Pripravený";
    }, 1500);
    return;
  }

  // Logovanie príkazu (už s normalizovaným cieľom, ak prebehol)
  console.log(
    `Vykonávam AI príkaz: Časť=${target || "N/A"}, Akcia=${action}, Os=${
      axis || "N/A"
    }, Hodnota=${value !== undefined ? value : "N/A"}`
  );
  if (micStatus) micStatus.textContent = "Rozumiem..."; // Status pre užívateľa

  // 3. Synchronizácia UI (HTML dropdown) s normalizovaným cieľom
  if (target && cubeSelector && cubeSelector.value !== target) {
    // Skontrolujeme, či normalizovaný cieľ existuje v možnostiach dropdownu
    if (Array.from(cubeSelector.options).some((opt) => opt.value === target)) {
      console.log(`Hlasový príkaz mení cieľ UI na ${target}`);
      cubeSelector.value = target; // Nastavíme hodnotu dropdownu
      displaySelectedCubeUI(target); // Zobrazíme UI pre danú časť
    } else {
      console.warn(`Normalizovaný cieľ "${target}" sa nenachádza v dropdowne.`);
    }
  }

  // 4. Vykonanie akcie na modeli
  switch (action) {
    case "setColor":
      if (target && value) {
        // value je teraz názov farby (malými písmenami)
        const hexColor = voiceColorPalette[value]; // Preklad na HEX
        if (hexColor) {
          console.log(`Prekladám "${value}" -> ${hexColor}. Aplikujem.`);
          updatePartColor(target, hexColor); // Použijeme preložený HEX
        } else {
          // Toto by nemalo nastať, ak extrakcia funguje, ale pre istotu
          console.warn(
            `Názov farby "${value}" nenájdený v palete po extrakcii!`
          );
          if (micStatus) micStatus.textContent = `Neznáma farba: ${value}`;
        }
      } else if (!value) {
        // Ak sa farba vôbec neextrahovala
        if (micStatus) micStatus.textContent = "Akú farbu?";
        console.warn(`Nebola extrahovaná hodnota farby pre ${target}`);
      }
      break;
    case "resetColor":
      if (target) resetPartColor(target);
      else console.warn("Chýba cieľ pre resetColor");
      break;
    case "setRotation":
      if (target && axis !== undefined && value !== undefined)
        updatePartRotation(target, axis, value);
      else console.warn("Chýba cieľ, os alebo hodnota pre setRotation");
      break;
    case "resetRotation":
      if (target) resetPartRotation(target);
      else console.warn("Chýba cieľ pre resetRotation");
      break;
    case "setScale":
      // Predpokladáme os 'z', ak nie je špecifikovaná inak alebo je neplatná
      const scaleAxis =
        axis === "x" || axis === "y" || axis === "z" ? axis : "z";
      if (target && value !== undefined)
        updatePartScale(target, scaleAxis, value);
      else console.warn("Chýba cieľ alebo hodnota pre setScale");
      break;
    case "resetScale":
      if (target) resetPartScale(target);
      else console.warn("Chýba cieľ pre resetScale");
      break;
    case "unknown":
      console.warn(`Backend nerozpoznal príkaz.`);
      if (micStatus) micStatus.textContent = "I don't understand";
      // Status sa resetne v onend
      break;
    default:
      console.warn(`Neznáma akcia prijatá z backendu alebo AI: "${action}"`);
      if (micStatus) micStatus.textContent = "Neznáma akcia";
  }
}

// --- Funkcie pre zvýraznenie ---
function highlightPart(mesh) {
  if (!mesh || !mesh.material) return;
  if (currentlySelectedMesh && currentlySelectedMesh !== mesh) {
    unhighlightPart(currentlySelectedMesh);
  }
  if (mesh.material.isMeshPhysicalMaterial) {
    mesh.material.emissive.copy(highlightColor);
    mesh.material.emissiveIntensity = highlightIntensity;
    currentlySelectedMesh = mesh;
  }
}
function unhighlightPart(mesh) {
  if (!mesh || !mesh.material) return;
  if (mesh.material.isMeshPhysicalMaterial) {
    mesh.material.emissive.setHex(0x000000);
  }
  if (currentlySelectedMesh === mesh) {
    currentlySelectedMesh = null;
  }
}

// === REFaktorované funkcie na ovládanie modelu a UI ===
function updatePartColor(partName, colorHex) {
  const targetMesh = modelParts[partName];
  if (targetMesh && targetMesh.material) {
    targetMesh.material.color.set(colorHex);
    const selectedPart = cubeSelector?.value;
    if (selectedPart === partName && selectedCubeColorsContainer) {
      const partControls = selectedCubeColorsContainer;
      partControls.querySelectorAll(".color-swatch").forEach((sw) => {
        sw.classList.toggle("active-swatch", sw.dataset.color === colorHex);
      });
    }
  }
}

function resetPartColor(partName) {
  const targetMesh = modelParts[partName];
  if (targetMesh && targetMesh.material) {
    targetMesh.material.color.copy(defaultPartColor);
    const selectedPart = cubeSelector?.value;
    if (selectedPart === partName && selectedCubeColorsContainer) {
      const partControls = selectedCubeColorsContainer;
      partControls
        .querySelectorAll(".color-swatch")
        .forEach((sw) => sw.classList.remove("active-swatch"));
    }
  }
}

function updatePartRotation(partName, axis, degrees) {
  const targetMesh = modelParts[partName];
  if (targetMesh && (axis === "x" || axis === "y")) {
    degrees = Math.max(-180, Math.min(180, degrees));
    const radians = THREE.MathUtils.degToRad(degrees);
    targetMesh.rotation[axis] = radians;
    const selectedPart = cubeSelector?.value;
    if (selectedPart === partName && selectedCubeTransformsContainer) {
      const partControls = selectedCubeTransformsContainer;
      const slider = partControls.querySelector(
        `input[type="range"][data-axis="${axis}"]`
      );
      const valueDisplay = slider ? slider.nextElementSibling : null;
      if (slider) slider.value = degrees;
      if (valueDisplay && valueDisplay.classList.contains("value-display"))
        valueDisplay.textContent = degrees.toFixed(0);
    }
  }
}

function resetPartRotation(partName) {
  const targetMesh = modelParts[partName];
  const initialRotation = initialRotations[partName];
  if (targetMesh && initialRotation) {
    targetMesh.rotation.copy(initialRotation);
    const selectedPart = cubeSelector?.value;
    if (selectedPart === partName && selectedCubeTransformsContainer) {
      const partControls = selectedCubeTransformsContainer;
      ["x", "y"].forEach((axis) => {
        const slider = partControls.querySelector(
          `input[type="range"][data-axis="${axis}"]`
        );
        const valueDisplay = slider ? slider.nextElementSibling : null;
        if (slider) {
          const resetDegrees = THREE.MathUtils.radToDeg(
            targetMesh.rotation[axis]
          ).toFixed(0);
          slider.value = resetDegrees;
          if (
            valueDisplay &&
            valueDisplay.classList.contains("value-display")
          ) {
            valueDisplay.textContent = resetDegrees;
          }
        }
      });
    }
  }
}

function updatePartScale(partName, axis, scaleValue) {
  const targetMesh = modelParts[partName];
  if (targetMesh && (axis === "z" || axis === "scaleZ")) {
    scaleValue = Math.max(0.1, Math.min(3.0, scaleValue));
    targetMesh.scale.z = scaleValue;
    const selectedPart = cubeSelector?.value;
    if (selectedPart === partName && selectedCubeTransformsContainer) {
      const partControls = selectedCubeTransformsContainer;
      const slider = partControls.querySelector(
        `input[type="range"][data-axis="scaleZ"]`
      );
      const valueDisplay = slider ? slider.nextElementSibling : null;
      if (slider) slider.value = scaleValue;
      if (valueDisplay && valueDisplay.classList.contains("value-display")) {
        valueDisplay.textContent = scaleValue.toFixed(2);
      }
    }
  }
}
function resetPartScale(partName) {
  const targetMesh = modelParts[partName];
  const initialScale = initialScales[partName];
  if (targetMesh && initialScale) {
    targetMesh.scale.copy(initialScale);
    console.log(`Mierka pre ${partName} resetovaná.`);
    const selectedPart = cubeSelector?.value;
    if (selectedPart === partName && selectedCubeTransformsContainer) {
      const partControls = selectedCubeTransformsContainer;
      const slider = partControls.querySelector(
        `input[type="range"][data-axis="scaleZ"]`
      );
      const valueDisplay = slider ? slider.nextElementSibling : null;
      if (slider) {
        slider.value = initialScale.z;
        if (valueDisplay && valueDisplay.classList.contains("value-display")) {
          valueDisplay.textContent = initialScale.z.toFixed(2);
        }
      }
    }
  }
}

// --- Funkcia pre animáciu - Pulzovanie v osi Z (pre Tween.js v18) ---
function triggerPulseAnimation(mesh) {
  if (!mesh) {
    console.warn("triggerPulseAnimation: mesh je null/undefined");
    return;
  }
  const meshName = mesh.name;
  const initialScale = initialScales[meshName];

  if (!initialScale) {
    console.warn(
      `Pulse animation skipped: Initial scale for '${meshName}' not found!`
    );
    return;
  }

  console.log(`--- triggerPulseAnimation (Z-axis) called for: ${meshName} ---`);
  console.log(`Current local scale [${meshName}]:`, mesh.scale.clone());

  const currentLocalScale = mesh.scale.clone();
  // Faktor zmenšenia/zväčšenia hrúbky (osi Z)
  // Hodnota < 1 = stlačenie, > 1 = roztiahnutie
  // Skúsme mierne stlačenie
  const zShrinkFactor = 0.6; // Stlačíme na 70% pôvodnej hrúbky
  const duration = 100;

  // --- ZMENA VÝPOČTU CIEĽOVÝCH ŠKÁL ---
  // Cieľová LOKÁLNA škála pre "stlačenie" v Z
  const shrinkTargetLocalScale = {
    x: currentLocalScale.x, // X zostáva nezmenené
    y: currentLocalScale.y, // Y zostáva nezmenené
    z: currentLocalScale.z * zShrinkFactor, // Meníme len Z
  };

  // Cieľová LOKÁLNA škála pre návrat (na pôvodnú LOKÁLNU škálu)
  const returnTargetLocalScale = {
    x: currentLocalScale.x,
    y: currentLocalScale.y,
    z: currentLocalScale.z,
  };
  // --- KONIEC ZMENY VÝPOČTU ---

  console.log(
    `Target shrink local scale (Z-axis) [${meshName}]:`,
    shrinkTargetLocalScale
  );
  console.log(
    `Target return local scale (Z-axis) [${meshName}]:`,
    returnTargetLocalScale
  );

  // Zastavenie predchádzajúcich tweenov pomocou TWEEN.remove()
  if (mesh.userData.pulseTweenShrink) {
    TWEEN.remove(mesh.userData.pulseTweenShrink);
    mesh.userData.pulseTweenShrink = null;
  }
  if (mesh.userData.pulseTweenGrow) {
    TWEEN.remove(mesh.userData.pulseTweenGrow);
    mesh.userData.pulseTweenGrow = null;
  }

  // Vytvorenie nových tweenov (stále animujeme celý mesh.scale objekt)
  const tweenShrink = new TWEEN.Tween(mesh.scale)
    .to(shrinkTargetLocalScale, duration) // Cieľ je teraz len so zmeneným Z
    .easing(TWEEN.Easing.Quadratic.Out);

  const tweenGrow = new TWEEN.Tween(mesh.scale)
    .to(returnTargetLocalScale, duration * 1.3) // Cieľ je teraz pôvodná lokálna škála
    .easing(TWEEN.Easing.Elastic.Out)
    .onComplete(() => {
      console.log(`--- Animation Complete [${meshName}] ---`);
    });

  tweenShrink.chain(tweenGrow);

  // Uloženie referencií
  mesh.userData.pulseTweenShrink = tweenShrink;
  mesh.userData.pulseTweenGrow = tweenGrow;

  // Štart animácie
  console.log(`--- Starting Z-axis MESH pulse animation for: ${meshName} ---`);
  tweenShrink.start();
}

// --- Funkcia na ZOBRAZENIE UI (UPRAVENÁ - volá animáciu) ---
function displaySelectedCubeUI(partName) {
  if (!selectedCubeColorsContainer || !selectedCubeTransformsContainer) return;
  selectedCubeColorsContainer.innerHTML = "";
  selectedCubeTransformsContainer.innerHTML = "";
  if (currentlySelectedMesh) {
    unhighlightPart(currentlySelectedMesh);
  }
  const mesh = modelParts[partName];
  if (!mesh || !mesh.material) {
    selectedCubeColorsContainer.innerHTML =
      '<p class="placeholder-text">Select Cube</p>';
    selectedCubeTransformsContainer.innerHTML =
      '<p class="placeholder-text">Select Cube</p>';
    currentlySelectedMesh = null;
    return;
  }
  highlightPart(mesh);
  triggerPulseAnimation(mesh); // <<< VOLANIE ANIMÁCIE
  const colorControlsWrapper = document.createElement("div");
  let colorsHtml = `<div class="swatch-row"><div class="swatches-container">`;
  for (const colorName in colorPalette) {
    const colorValue = colorPalette[colorName];
    const isActive = `#${mesh.material.color.getHexString()}` === colorValue;
    colorsHtml += `<div class="color-swatch ${
      isActive ? "active-swatch" : ""
    }" style="background-color: ${colorValue}" data-color="${colorValue}" data-part-name="${partName}"></div>`;
  }
  colorsHtml += `</div><button class="reset-button color-reset" data-part-name="${partName}">Reset</button></div>`;
  colorControlsWrapper.innerHTML = colorsHtml;
  selectedCubeColorsContainer.appendChild(colorControlsWrapper);
  const sliderColumn = document.createElement("div");
  sliderColumn.className = "slider-controls-column";
  const buttonColumn = document.createElement("div");
  buttonColumn.className = "reset-buttons-column";
  let slidersHtml = `<div class="control-title">Rotate:</div><div class="slider-container">`;
  ["x", "y"].forEach((axis) => {
    const rotValue = THREE.MathUtils.radToDeg(mesh.rotation[axis]).toFixed(0);
    slidersHtml += `<div class="slider-row"><label>Rot ${axis.toUpperCase()}:</label><input type="range" min="-180" max="180" step="1" value="${rotValue}" data-part-name="${partName}" data-axis="${axis}"><span class="value-display">${rotValue}</span></div>`;
  });
  slidersHtml += `</div>`;
  slidersHtml += `<div class="control-title">Scale:</div><div class="slider-container">`;
  const scaleValue = mesh.scale.z.toFixed(2);
  slidersHtml += `<div class="slider-row"><label>Scale Z:</label><input type="range" min="0.1" max="3.0" step="0.05" value="${scaleValue}" data-part-name="${partName}" data-axis="scaleZ"><span class="value-display">${scaleValue}</span></div>`;
  slidersHtml += `</div>`;
  sliderColumn.innerHTML = slidersHtml;
  let buttonsHtml = `<button class="rotation-reset-button" data-part-name="${partName}">Reset Rotate</button>`;
  buttonsHtml += `<button class="scale-reset-button" data-part-name="${partName}">Reset Scale</button>`;
  buttonColumn.innerHTML = buttonsHtml;
  selectedCubeTransformsContainer.appendChild(sliderColumn);
  selectedCubeTransformsContainer.appendChild(buttonColumn);
  selectedCubeColorsContainer
    .querySelectorAll(".color-swatch")
    .forEach((sw) => sw.addEventListener("click", handleColorChange));
  selectedCubeColorsContainer
    .querySelectorAll(".reset-button.color-reset")
    .forEach((btn) => btn.addEventListener("click", handleColorReset));
  selectedCubeTransformsContainer
    .querySelectorAll('.slider-row input[type="range"]')
    .forEach((slider) => {
      if (slider.dataset.axis === "x" || slider.dataset.axis === "y") {
        slider.addEventListener("input", handleRotationChange);
      } else if (slider.dataset.axis === "scaleZ") {
        slider.addEventListener("input", handleScaleChange);
      }
    });
  selectedCubeTransformsContainer
    .querySelectorAll(".rotation-reset-button")
    .forEach((btn) => btn.addEventListener("click", handleRotationReset));
  selectedCubeTransformsContainer
    .querySelectorAll(".scale-reset-button")
    .forEach((btn) => btn.addEventListener("click", handleScaleReset));
}

// --- Event Handler funkcie (VOLAJÚ REFaktorované) ---
function handleColorChange(event) {
  updatePartColor(event.target.dataset.partName, event.target.dataset.color);
}
function handleColorReset(event) {
  resetPartColor(event.target.dataset.partName);
}
function handleRotationChange(event) {
  updatePartRotation(
    event.target.dataset.partName,
    event.target.dataset.axis,
    parseFloat(event.target.value)
  );
}
function handleRotationReset(event) {
  resetPartRotation(event.target.dataset.partName);
  triggerPulseAnimation(modelParts[event.target.dataset.partName]);
} // <<< Trigger pulse on reset
function handleScaleChange(event) {
  updatePartScale(
    event.target.dataset.partName,
    "z",
    parseFloat(event.target.value)
  );
}
function handleScaleReset(event) {
  resetPartScale(event.target.dataset.partName);
  triggerPulseAnimation(modelParts[event.target.dataset.partName]);
} // <<< Trigger pulse on reset

// --- Funkcie na naplnenie selectorov ---
function populateEnvironmentSelector() {
  if (!environmentSelector) return;
  environmentSelector.innerHTML = "";
  for (const name in environmentMaps) {
    const path = environmentMaps[name];
    const option = document.createElement("option");
    option.value = path;
    option.textContent = name;
    if (name === defaultEnvironmentKey) {
      option.selected = true;
    }
    environmentSelector.appendChild(option);
  }
  environmentSelector.addEventListener("change", (event) => {
    loadEnvironment(event.target.value, currentEnvironmentRotation, false);
  });
}
function populateCubeSelectorAndSetupUI() {
  if (cubeSelector) {
    while (cubeSelector.options.length > 1) {
      cubeSelector.remove(1);
    }
    const defaultPartToSelect = "Cube01";
    Object.keys(modelParts)
      .sort()
      .forEach((partName) => {
        const option = document.createElement("option");
        option.value = partName;
        option.textContent = customPartDisplayNames[partName] || partName;
        cubeSelector.appendChild(option);
      });
    if (modelParts[defaultPartToSelect]) {
      cubeSelector.value = defaultPartToSelect;
    }
    cubeSelector.addEventListener("change", (event) => {
      displaySelectedCubeUI(event.target.value);
    });
    displaySelectedCubeUI(cubeSelector.value);
  }
}

// --- Načítanie GLB modelu ---
const loader = new GLTFLoader();
const modelPath = "models/glass-voice-4.glb";
loader.load(
  modelPath,
  (gltf) => {
    console.log("Model úspešne načítaný.");
    model = gltf.scene;
    modelParts = {};
    initialRotations = {};
    initialScales = {};
    model.rotation.x = THREE.MathUtils.degToRad(0);
    model.rotation.y = THREE.MathUtils.degToRad(30);
    model.rotation.z = THREE.MathUtils.degToRad(0);
    model.traverse((child) => {
      if (child.isMesh && child.name.startsWith("Cube")) {
        if (child.material) {
          child.material = child.material.clone();
        } else {
          child.material = new THREE.MeshStandardMaterial({
            color: defaultPartColor.clone(),
          });
        }
        modelParts[child.name] = child;
        initialRotations[child.name] = child.rotation.clone();
        initialScales[child.name] = child.scale.clone();
      }
    });
    applyGlassMaterial(model, hdriTexture);
    scene.add(model);
    console.log("Model pridaný do scény.");
    const defaultColorsSetup = {
      Cube02: colorPalette.orange,
      Cube03: colorPalette.pink,
      Cube07: colorPalette.blue,
    };
    for (const partName in defaultColorsSetup) {
      if (modelParts[partName] && modelParts[partName].material) {
        modelParts[partName].material.color.set(defaultColorsSetup[partName]);
      } else {
        console.warn(`   Časť ${partName} pre predvolenú farbu nenájdená.`);
      }
    }
    try {
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      if (!box.isEmpty()) {
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 4.2 / maxDim;
        model.scale.set(scale, scale, scale);
        model.position.sub(center.multiplyScalar(scale));
      } else {
        console.warn("Bounding box modelu je prázdny.");
      }
    } catch (e) {
      console.error("Chyba pri centrovaní/škálovaní:", e);
    }
    const finalPositionX = 0;
    const initialModelY = window.innerWidth <= MOBILE_BREAKPOINT ? MOBILE_MODEL_Y : DESKTOP_MODEL_Y;
    const finalPositionZ = 2;
    model.position.set(finalPositionX, initialModelY, finalPositionZ);
    console.log(`Initial model position set to: X=${finalPositionX}, Y=${initialModelY}, Z=${finalPositionZ}`);
    populateEnvironmentSelector();
    populateCubeSelectorAndSetupUI();
    isModelLoaded = true;
    modelProgress = 1.0;
    updateCombinedProgress();
    checkLoadingComplete();
  },
  (xhr) => {
    if (xhr.lengthComputable && xhr.total > 0) {
      modelProgress = xhr.loaded / xhr.total;
      updateCombinedProgress();
    } else {
      modelProgress = Math.min(modelProgress + 0.05, 0.95);
      updateCombinedProgress();
    }
  },
  (error) => {
    console.error(
      `!!! HTTP Chyba pri načítavaní modelu z ${modelPath}:`,
      error
    );
    isModelLoaded = true;
    modelProgress = 1.0;
    updateCombinedProgress();
    checkLoadingComplete(true);
  }
);

// --- Ovládanie myšou ---
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0.5, 1);

// --- Listener pre kliknutie myšou ---
canvas.addEventListener("click", onCanvasClick);
function onCanvasClick(event) {
  if (!model) return;
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(model, true);
  if (intersects.length > 0) {
    let clickedObject = intersects[0].object;
    let targetPartName = null;
    while (clickedObject && !targetPartName) {
      if (clickedObject.isMesh && modelParts[clickedObject.name]) {
        targetPartName = clickedObject.name;
      }
      clickedObject = clickedObject.parent;
    }
    if (targetPartName) {
      if (cubeSelector) {
        cubeSelector.value = targetPartName;
      }
      displaySelectedCubeUI(targetPartName);
    } else {
      if (cubeSelector) cubeSelector.value = "";
      displaySelectedCubeUI("");
    }
  } else {
    if (cubeSelector) cubeSelector.value = "";
    displaySelectedCubeUI("");
  }
}

// --- Spracovanie zmeny veľkosti okna (S Debounce a úpravou kamery aj modelu) ---
let resizeTimeout;
window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        console.log("Window resized");
        sizes.width = window.innerWidth;
        sizes.height = window.innerHeight;

        camera.aspect = sizes.width / sizes.height;
        camera.updateProjectionMatrix();

        renderer.setSize(sizes.width, sizes.height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // <<< ZAVOLÁME OBE FUNKCIE >>>
        adjustCameraPosition();
        adjustModelPosition();
        // Po zmene pozície modelu by sa mala aktualizovať aj podlaha, ak ju máte
        // positionGroundPlane(); // Môžeme volať aj tu, ale v onComplete tweenu je lepšie

    }, 150); // Pauza
});

// --- Funkcia na úpravu Y pozície modelu podľa šírky ---
function adjustModelPosition() {
  if (!model) return; // Ak model ešte nie je načítaný

  const currentY = model.position.y;
  const targetY = window.innerWidth <= MOBILE_BREAKPOINT ? MOBILE_MODEL_Y : DESKTOP_MODEL_Y;

  // Ak sa cieľ líši a nebeží už animácia modelu
  if (Math.abs(currentY - targetY) > 0.05 && !modelPositionTween) { // Menšia tolerancia pre pozíciu
      console.log(`Adjusting model Y from ${currentY.toFixed(1)} to ${targetY}`);

      // Zastavíme starý tween, ak existuje
      if (modelPositionTween) modelPositionTween.stop();

      // Vytvoríme a spustíme nový tween pre model.position
      modelPositionTween = new TWEEN.Tween(model.position)
          .to({ y: targetY }, 400) // Animujeme len Y súradnicu
          .easing(TWEEN.Easing.Quadratic.Out)
          .onComplete(() => {
              modelPositionTween = null;
              console.log(`Model Y adjustment complete. Now at: ${model.position.y.toFixed(1)}`);
          })
          .start();
  } else if (Math.abs(currentY - targetY) <= 0.05 && modelPositionTween) {
      // Ak sme blízko a tween beží, zastavíme ho
      modelPositionTween.stop();
      modelPositionTween = null;
  }
}

// --- Animačná slučka (UPRAVENÁ pre TWEEN) ---
const animate = () => {
  requestAnimationFrame(animate);
  TWEEN.update();
  controls.update();
  renderer.render(scene, camera);
};
animate();
initializePopups();
