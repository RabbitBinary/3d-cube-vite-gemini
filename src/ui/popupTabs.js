export function setupPopupTabs() {
    const popupTabs = document.querySelector('.popup-tabs');
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.popup-tab-content');

    if (popupTabs && tabButtons.length > 0 && tabContents.length > 0) {
        popupTabs.addEventListener('click', (event) => {
            if (event.target.classList.contains('tab-button')) {
                const targetLang = event.target.dataset.lang;
                tabButtons.forEach(button => button.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                event.target.classList.add('active');
                const targetContent = document.getElementById(`popup-content-${targetLang}`);
                if (targetContent) {
                    targetContent.classList.add('active');
                }
                console.log(`Switched popup language to: ${targetLang}`);
            }
        });
        console.log("Popup tabs listeners added.");
    } else {
        console.warn("Could not find elements for popup tabs.");
    }
}