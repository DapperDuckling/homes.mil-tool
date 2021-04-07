// Adapted from: https://stackoverflow.com/a/44864966/3101412
function createTab (url) {
    return new Promise(resolve => {
        chrome.tabs.create({url}, async tab => {
            chrome.tabs.onUpdated.addListener(function listener (tabId, info) {
                if (info.status === 'complete' && tabId === tab.id) {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve(tab);
                }
            });
        });
    });
}


self.addEventListener('install', async function() {
   // console.log('test');

});

chrome.runtime.onMessage.addListener(
    async (request, sender, sendResponse) => {

        // Create a new tab with the map maker
        let tab = await createTab('https://www.easymapmaker.com/');
        chrome.scripting.executeScript({
            files: ['js/mapmaker.js'],
            target: {
                tabId: tab.id,
            },
        }, () => {
            // Send the data to the new tab
            chrome.tabs.sendMessage(tab.id, request);
        });

        sendResponse(true);
    }
);