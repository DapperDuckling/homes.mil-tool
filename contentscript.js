// Set a flag to disable the end user monitoring script
window["adrum-disable"] = true;

// Load the UI & script
fetch(chrome.runtime.getURL('/tool.html'))
    .then(response => response.text())
    .then(data => {

        if (typeof $ !== 'function') throw new Error('jQuery or like library missing. will not load tool.');
        $("body").append(data);

        let s = document.createElement('script');
        s.src = chrome.runtime.getURL('/script.js');
        s.onload = function() {
            this.remove();
        };
        (document.head || document.documentElement).appendChild(s);
    });
