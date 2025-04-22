// src/ui/popups.js

// --- Pomocná funkcia pre nastavenie záložiek v danom popupe ---
function setupTabsForPopup(popupElement) {
  const popupTabs = popupElement.querySelector(".popup-tabs");
  const tabButtons = popupElement.querySelectorAll(".tab-button");
  const tabContents = popupElement.querySelectorAll(".popup-tab-content");

  if (popupTabs && tabButtons.length > 0 && tabContents.length > 0) {
    // Defaultne aktívna prvá záložka (ak žiadna nie je)
    if (!popupElement.querySelector(".tab-button.active")) {
      tabButtons[0]?.classList.add("active");
    }
    if (!popupElement.querySelector(".popup-tab-content.active")) {
      tabContents[0]?.classList.add("active");
    }

    popupTabs.addEventListener("click", (event) => {
      if (event.target.classList.contains("tab-button")) {
        const targetLang = event.target.dataset.lang;
        const popupId = popupElement.id;
        // Dynamické odvodenie prefixu ID obsahu
        const anyContentId = tabContents[0]?.id || "";
        const contentIdPrefix = anyContentId.replace(
          /-[a-z]{2}-(about|help)$/,
          "-"
        );

        // Odstránenie active tried v rámci tohto popupu
        tabButtons.forEach((button) => button.classList.remove("active"));
        tabContents.forEach((content) => content.classList.remove("active"));

        event.target.classList.add("active"); // Aktivácia kliknutého

        // Zobrazenie správneho obsahu
        const typeSuffix = popupId.includes("about") ? "about" : "help";
        const targetContentId = `${contentIdPrefix}${targetLang}-${typeSuffix}`;
        const targetContent = popupElement.querySelector(`#${targetContentId}`);

        if (targetContent) {
          targetContent.classList.add("active");
          console.log(`Switched ${popupId} language to: ${targetLang}`);
        } else {
          console.warn(
            `Content with ID #${targetContentId} not found in #${popupId}.`
          );
        }
      }
    });
    // console.log(`Popup tabs listeners added for ${popupElement.id}.`);
  } else {
    // console.warn(`Could not find elements for popup tabs in ${popupElement.id}.`);
  }
}

// --- Hlavná exportovaná funkcia pre inicializáciu VŠETKÝCH popupov ---
// Táto funkcia nájde všetky elementy a priradí VŠETKY listenery
export function initializePopups() {
  console.log("Initializing popups..."); // Log pre kontrolu

  const aboutButton = document.getElementById("about-button");
  const helpButton = document.getElementById("help-button");
  const aboutPopup = document.getElementById("about-popup");
  const helpPopup = document.getElementById("help-popup");
  const closePopupButtons = document.querySelectorAll(".close-popup-button"); // Používame triedu

  let popupsInitialized = false;

  // Otvorenie About Popupu
  if (aboutButton && aboutPopup) {
    aboutButton.addEventListener("click", (e) => {
      e.preventDefault(); // Pre istotu, ak by bol v linku
      console.log("About button clicked");
      aboutPopup.classList.add("visible");
    });
    console.log("Listener pre #about-button pridaný.");
    popupsInitialized = true;
  } else {
    console.warn("Elementy pre About popup nenájdené.");
  }

  // Otvorenie Help Popupu
  if (helpButton && helpPopup) {
    helpButton.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Help button clicked");
      helpPopup.classList.add("visible");
    });
    console.log("Listener pre #help-button pridaný.");
    popupsInitialized = true;
  } else {
    console.warn("Elementy pre Help popup nenájdené.");
  }

  // Zatvorenie tlačidlom X (pre oba popupy)
  if (closePopupButtons.length > 0) {
    closePopupButtons.forEach((button) => {
      button.addEventListener("click", (e) => {
        e.preventDefault();
        const popupToClose = button.closest("#about-popup, #help-popup");
        if (popupToClose) {
          console.log(`Closing popup #${popupToClose.id} via X button.`);
          popupToClose.classList.remove("visible");
        }
      });
    });
    console.log("Listenery pre .close-popup-button pridané.");
    popupsInitialized = true;
  } else {
    console.warn("Nenašli sa .close-popup-button elementy.");
  }

  // Zatvorenie kliknutím na pozadie (pre oba popupy)
  [aboutPopup, helpPopup].forEach((popup) => {
    if (popup) {
      popup.addEventListener("click", (event) => {
        // Zatvorí sa len ak sa kliklo priamo na overlay (.about-popup alebo #help-popup)
        if (event.target === popup) {
          console.log(`Closing popup #${popup.id} via background click.`);
          popup.classList.remove("visible");
        }
      });
      // Inicializácia záložiek pre tento popup
      setupTabsForPopup(popup);
      popupsInitialized = true;
    }
  });

  if (popupsInitialized) {
    console.log("Popup system initialized successfully.");
  } else {
    console.warn(
      "Popup system could not be fully initialized (missing elements?)."
    );
  }
}
