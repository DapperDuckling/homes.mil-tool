function handleRequest(inputData) {
    // Copy the data over
    $('#sourceData').val(inputData).trigger('change');

    // Update the options
    $("#lat_sel").val(-1);
    $("#long_sel").val(-1);
    $( "#clusterCB" ).prop( "checked", true );

    // Make the map
    $('#makeMapButton').click();
}


chrome.runtime.onMessage.addListener(
    async (request, sender, sendResponse) => {

        handleRequest(request.resultData);

        // On success
        sendResponse(true);
    }
);