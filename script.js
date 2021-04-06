class ResultExtractor {

    static PAGE_INFO_REGEX = /(\d+) to (\d+) of (\d+)/;

    static _isRunning = false;
    static _forceGeneratePromise;
    static _forceGenerateReject;
    static _forceGenerateMap = false; // Did the user forcibly request a map with the current dataset
    static _propertyData = [];
    static _errorProperties = [];

    // Entrypoint into the result extractor tool
    static init() {

        // Checks for magic text on page to determine suitability of loading
        let foundMagicText = $("div.ngComp.h2a").text().includes("Property Search Results");
        if (!foundMagicText) return;

        // Grab the extract button
        let extractButton = $('#ducky-home-tool button.extract');

        // Display the extract tool button
        extractButton.show();

        // Bind the button to the extract event
        extractButton.one('click', this._extract);

        // Make the loading box draggable
        $('#ducky-home-tool div.loading').draggable();

        // Bind the override button
        $('#ducky-home-tool button.generate-map').one('click', ResultExtractor._forceGenerate);

    }

    static _resetForceGeneratePromise() {
        ResultExtractor._forceGenerateMap = false;
        ResultExtractor._forceGeneratePromise = new Promise((resolve, reject) => {
            ResultExtractor._forceGenerateReject = reject;
        });
    }

    static _forceGenerate() {
        ResultExtractor._forceGenerateMap = true;
        ResultExtractor._forceGenerateReject('USER_FORCE');
    }

    static _generateMap() {

    }

    /**
     * Handles pulling the result data from each available page
     * @private
     */
    static async _loadResultData() {

        let hasNextPage = false;
        let offset = 0;
        let errorTries = 0;
        let resultData;

        // Update the page loaded count
        ResultExtractor._updateCurrPage();
        ResultExtractor._updateTotalPages();

        do {
debugger;
            // Check for a user override
            if (ResultExtractor._forceGenerateMap) return;

            // Force result page to update
            // (Weird way the backend works)
            try {
                await $.ajax({
                    type: "GET",
                    url: "/homes/DispatchServlet/Back?Mod=top&OFFSET=" + offset,
                    error: () => {
                        // Override default error msg
                    }
                });
            } catch (e) {
                // Expected due to server-side redirects to http instead of https
            }

            // Check for a user override
            if (ResultExtractor._forceGenerateMap) return;

            try {

                // Grab the updated result page
                resultData = await $.ajax({
                    type: "GET",
                    url: "/homes/DispatchServlet/Back?Mod=HomesPropertySearch",
                    dataType: 'text',
                    error: (a,b,error) => {
                        // Unexpected
                        console.log(error);
                        throw new Error();
                    }
                });

            } catch (e) {

                // Check if we can redo
                if (errorTries++ <= 5) {
                    continue;
                }

                // Too many errors, fail
                alert('Tried ' + errorTries + ' to pull result page. Stopping further result extraction!');
                return;
            }

            // Check for a user override
            if (ResultExtractor._forceGenerateMap) return;

            // Reset the error tries
            errorTries = 0;

            // Parse the result
            let resultParsed = $(resultData);

            // Store the property search promises
            let propertyPromises = [];

            // Loop through each of the results on this page
            resultParsed.find("div.ngComp a.ngLink[title='Details']").each(async (i, element) => {

                let propertyPromise = new Promise(async (resolve) => {

                    try {
                        await ResultExtractor._grabPropertyDetails(element);
                    } catch (e) {
                        // Save this error property
                        ResultExtractor._errorProperties.push(element.text() + ' - ' + element.get(0).href);
                    }

                    return resolve();
                });

                // Add the promise to the tracker
                propertyPromises.push(propertyPromise);

            });

            // Check for a user override
            if (ResultExtractor._forceGenerateMap) return;

            await Promise.all(propertyPromises);

            // Update the page loaded value
            ResultExtractor._updateCurrPage(resultParsed);

            // Update the offset
            offset += 10;

            // Check for a next page
            hasNextPage = resultParsed.find("#c8-comp a[title='Next Page']").length > 0;

        } while (hasNextPage);

    }

    static async _grabPropertyDetails(linkElement) {

        let retries = 0;
        let parsedData = null;
        const requestObj = {
            type: "GET",
            url: linkElement.href,
            dataType: 'text',
            success: (data) => {
                parsedData = $(data);
            },
            error: async (a, b, error) => {

                // Check for a user override
                if (ResultExtractor._forceGenerateMap) return;

                if (retries++ <= 3) {
                    await $.ajax(requestObj);
                    return;
                }

                // Unexpected
                console.log(error);
                throw new Error();
            }
        };

        // Make the request
        await $.ajax(requestObj);

        // Check for a user override
        if (ResultExtractor._forceGenerateMap) return;

        if (parsedData === null) {
            throw new Error('No parsed data passed to property processing');
        }

        // Build our property's object
        let propertyData = {
            listingId: parsedData.find('#c29-comp').text(),
            name: parsedData.find('#c32-comp').text() + " " + parsedData.find('#c33-comp').text(),
            phone: parsedData.find('#c36-comp').text(),
            available: parsedData.find('#c13-comp').text(),
            address: parsedData.find('#c17-comp').text() + ", " + parsedData.find('#c18-comp').text(),
            other: parsedData.find('#c40-comp').text(),
            details: {
                type: parsedData.find('#FAC_DISP-comp').text(),
                rpp: parsedData.find('#cXX-comp').text(),
                privatized: parsedData.find('#cXX-comp').text(),
                tla: parsedData.find('#cXX-comp').text(),
                plan: parsedData.find('#cXX-comp').text(),
                bedrooms: parsedData.find('#cXX-comp').text(),
                sqft: parsedData.find('#cXX-comp').text(),
                baths: {
                    full: parsedData.find('#cXX-comp').text(),
                    threeQtr: parsedData.find('#cXX-comp').text(),
                    half: parsedData.find('#cXX-comp').text(),
                },
                stories: parsedData.find('#cXX-comp').text(),
                units: parsedData.find('#cXX-comp').text(),
                furnished: parsedData.find('#cXX-comp').text(),
                ada: parsedData.find('#cXX-comp').text(),
                smoking: parsedData.find('#cXX-comp').text(),
                yearBuilt: parsedData.find('#cXX-comp').text(),
                occupied: parsedData.find('#cXX-comp').text(),
                listed: parsedData.find('#cXX-comp').text(),
                roommatesAllowed: parsedData.find('#cXX-comp').text(),
                pets: parsedData.find('#cXX-comp').text(),
            },
            costs: {
                term: parsedData.find('#cXX-comp').text(),
                monthlyRent: parsedData.find('#cXX-comp').text(),
                deposit: parsedData.find('#cXX-comp').text(),
                petDeposit: parsedData.find('#cXX-comp').text(),
                appFee: parsedData.find('#cXX-comp').text(),
                applicationViewFee: parsedData.find('#cXX-comp').text(),
                creditCheckFee: parsedData.find('#cXX-comp').text(),
                otherFee: parsedData.find('#cXX-comp').text(),
                averageUtilities: parsedData.find('#cXX-comp').text(),
                scraMilClause: parsedData.find('#cXX-comp').text(),
                inspectionStatus: parsedData.find('#cXX-comp').text(),
            },
            locationDetails: {
                community: parsedData.find('#cXX-comp').text(),
                schoolDistrict: parsedData.find('#cXX-comp').text(),
                distanceToInstallation: parsedData.find('#cXX-comp').text(),
                gpsLat: parsedData.find('#cXX-comp').text(),
                gpsLong: parsedData.find('#cXX-comp').text(),
                map: parsedData.find('#cXX-comp').text(),
                website: parsedData.find('#cXX-comp').text(),
            },
            amenities: {
                appliancesIncl: parsedData.find('#cXX-comp').text(),
                community: parsedData.find('#cXX-comp').text(),
                features: parsedData.find('#cXX-comp').text(),
                heatingCooling: parsedData.find('#cXX-comp').text(),
                parking: parsedData.find('#cXX-comp').text(),
                safetySecurity: parsedData.find('#cXX-comp').text(),
            }
        }

        ResultExtractor._storePropertyData(propertyData);

    }

    static _updateCurrPage(sourceElement = null) {

        if (sourceElement === null) {
            sourceElement = $('body');
        }

        // Find the actual page info element
        sourceElement = sourceElement.find("#c8-comp span.ngScrollPadLegend");

        // Find regex matches
        let pageInfoMatches = sourceElement.text().match(ResultExtractor.PAGE_INFO_REGEX);

        // One liner to find the current page
        let currPage = Math.ceil(pageInfoMatches[1] / (pageInfoMatches[2] - pageInfoMatches[1] + 1)) ?? "??";

        // Update the current page
        $("#ducky-home-tool div.loading span.page-curr").text(currPage);

    }

    static _updateTotalPages(sourceElement = null) {

        if (sourceElement === null) {
            sourceElement = $('body');
        }

        // Find the actual page info element
        sourceElement = sourceElement.find("#c8-comp span.ngScrollPadLegend");

        // Find regex matches
        let pageInfoMatches = sourceElement.text().match(ResultExtractor.PAGE_INFO_REGEX);

        // One liner to find the total number of pages
        let totalPages = Math.ceil(pageInfoMatches[3] / (pageInfoMatches[2] - pageInfoMatches[1] + 1)) ?? "??";

        // Update the total number of pages
        $("#ducky-home-tool div.loading span.page-total").text(totalPages);
    }

    static _storePropertyData(propertyData) {

        // Save the property data
        ResultExtractor._propertyData.push(propertyData);

    }

    /**
     * Starts the process of extracting data from the search results
     * @private
     */
    static async _extract() {

        // Check if there are results
        if ($("#c4-comp").text().includes("No Matching Listings Found")) {
            alert('No listings to found');
            return;
        }

        // Reset flags
        ResultExtractor._isRunning = [];
        ResultExtractor._propertyData = [];
        ResultExtractor._resetForceGeneratePromise();

        // Grab the tool div
        let toolDiv = $('#ducky-home-tool');

        // Disable the extract button
        toolDiv.find('button.extract').prop('disabled', true);

        // Grab the skip loading button
        let loadingBtn = toolDiv.find('button.generate-map');

        // Enable the skip loading button
        loadingBtn.prop('disabled', false);

        // Bind the skip loading button
        loadingBtn.one('click', () => {
            // Set our forced flag
            ResultExtractor._forceGenerateMap = true;

            // Call the map generator
            ResultExtractor._generateMap();
        });

        // todo: Determine how many pages we are grabbing and update the UI

        // Pull the results
        try {
            await Promise.all([ResultExtractor._loadResultData(), ResultExtractor._forceGeneratePromise]);
        } catch (e) {
            // Expected if the force generate button is pushed
        }

        // Display the results
        console.log(ResultExtractor._propertyData, ResultExtractor._errorProperties);



    }
}

ResultExtractor.init();