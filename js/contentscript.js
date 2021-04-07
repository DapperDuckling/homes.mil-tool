/**
 * Changes to this file require reloading the extension in Chrome!
 *
 * @type {HTMLScriptElement}
 */

// Set a flag to disable the end user monitoring script
let s = document.createElement('script');
s.src = chrome.runtime.getURL('js/adrum-disable.js');
s.onload = function() {
    this.remove();
};
(document.head || document.documentElement).appendChild(s);

// todo: Determine which tooling to load

// Load the UI & script
fetch(chrome.runtime.getURL('ui/tool.html'))
    .then(response => response.text())
    .then(data => {

        if (typeof $ !== 'function') throw new Error('jQuery or like library missing. will not load tool.');

        // Add the homes.mil UI
        $("body").append(data);

        // Bind the homes.mil create map button
        $("#ducky-home-tool").on('click', 'button.make-map', () => {
            let resultData = $("#ducky-home-tool div.results textarea.property-data").val();

            chrome.runtime.sendMessage({resultData: resultData}, function(response) {
                if (chrome.runtime.lastError) {
                    alert('Failed to invoke map creation script, see console for error (F12)');
                    console.log(chrome.runtime.lastError.message);
                } else if (response !== true) {
                    alert('Failed to make map, see console for error (F12)');
                    console.log(response);
                }
            });
        });

        // Dynamically add homes.mil script
        let s = document.createElement('script');
        s.src = chrome.runtime.getURL('js/script.js');
        s.onload = function() {
            this.remove();
        };
        (document.head || document.documentElement).appendChild(s);
    });
