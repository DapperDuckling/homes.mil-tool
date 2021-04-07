/**
 * Changes to this file require reloading the extension in Chrome!
 *
 * @type {HTMLScriptElement}
 */

// Set a flag to disable the end user monitoring script
let s = document.createElement('script');
s.src = chrome.runtime.getURL('/adrum-disable.js');
s.onload = function() {
    this.remove();
};
(document.head || document.documentElement).appendChild(s);

// todo: Determine which tooling to load

// Load the UI & script
fetch(chrome.runtime.getURL('/tool.html'))
    .then(response => response.text())
    .then(data => {

        if (typeof $ !== 'function') throw new Error('jQuery or like library missing. will not load tool.');

        // Add the homes.mil UI
        $("body").append(data);

        // Clear the storage
        chrome.storage.sync.clear();

        // Bind the homes.mil create map button
        $("#ducky-home-tool").on('click', 'button.make-map', () => {
            let resultData = $("#ducky-home-tool div.results textarea.property-data").val();
            let storageKey = 'map-data-' + Date.now();
            let storageObj = {};
            storageObj[storageKey] = resultData;

            chrome.storage.sync.set(storageObj);

            chrome.runtime.sendMessage({resultData: resultData}, function(response) {
                if (chrome.runtime.lastError) {
                    alert('Failed to invoke map creation script, see console for error (F12)');
                    console.log(chrome.runtime.lastError.message);
                }

                if (response !== true) {
                    alert('Failed to make map, see console for error (F12)');
                    console.log(response);
                }
            });
        });

        // Dynamically add homes.mil script
        let s = document.createElement('script');
        s.src = chrome.runtime.getURL('/script.js');
        s.onload = function() {
            this.remove();
        };
        (document.head || document.documentElement).appendChild(s);
    });
