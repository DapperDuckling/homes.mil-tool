self.addEventListener('install', function(event) {
   // console.log('test');
});

chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {
        console.log(sender.tab ?
            "from a content script:" + sender.tab.url :
            "from the extension");
        console.log(request);

        // // Request data
        // request.resultData

        // On success
        sendResponse(true);
    }
);