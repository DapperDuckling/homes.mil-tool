/** @function $ */ // Hush intelliJ, jQuery will be available at runtime

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
        if (!ResultExtractor._hasMagicText()) return;

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

    static async sleep(ms) {
        // Sleep for a bit
        await new Promise(resolve => setTimeout(resolve, ms));
    }

    static _hasMagicText() {
        return $("div.ngComp.h2a").text().includes("Property Search Results");
    }

    static _hasCurrentPageText(sourceElem) {
        return sourceElem.find("#c8-comp span.ngScrollPadCurrent").length === 1;
    }

    static _getCurrentPageValue(sourceElem) {
        return parseInt(sourceElem.find("#c8-comp span.ngScrollPadCurrent").text());
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

        let offset = 0;
        let errorTries = 0;
        let isLastPage, resultData, resultParsed;
        let loadedPages = [];
        let loadingDetailElem = $("#ducky-home-tool div.loading div.property");

        // Update the page loaded count
        $("#ducky-home-tool div.loading span.page-curr").text("0");
        ResultExtractor._updateTotalPages();

        // Hide the property progress
        loadingDetailElem.css('visibility', 'hidden');

        do {

            // Check for a user override
            if (ResultExtractor._forceGenerateMap) return;

            // Update the UI
            ResultExtractor._updateCurrProperty(0);

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
                        throw new Error(error);
                    }
                });

                // Check for a user override
                if (ResultExtractor._forceGenerateMap) return;

                // Reset the error tries
                errorTries = 0;

                // Parse the result
                // resultParsed = $(resultData);
                resultParsed = $($.parseHTML(resultData));

                // Check for a page number
                if (!ResultExtractor._hasCurrentPageText(resultParsed)) {
                    // noinspection ExceptionCaughtLocallyJS
                    throw new Error('Cannot find page number');
                }

                // Get the current page from DOM (not the mathematical way)
                let markedCurrentPage = ResultExtractor._getCurrentPageValue(resultParsed);

                // Check if we have already loaded this page
                if (loadedPages.includes(markedCurrentPage)) {
                    alert('Attempted to load the same result page twice, stopping further result extraction!');
                    return;
                }

                // Add the page number to our tracker
                loadedPages.push(markedCurrentPage);

            } catch (e) {

                // Log the error
                console.log(e);

                // Check if we can redo
                if (errorTries++ <= 5) {
                    continue;
                }

                // Too many errors, fail
                alert('Tried ' + errorTries + ' to pull result page. Stopping further result extraction!');
                return;
            }

            // Grab the list of results
            let resultList = resultParsed.find("div.ngComp a.ngLink[title='Details']");

            // Update the UI
            ResultExtractor._updateTotalProperties(resultList.length);

            // Show the property progress
            loadingDetailElem.css('visibility', 'visible');

            // Loop through each of the results on this page
            for(let i=0; i<resultList.length; i++) {
                try {
                    await ResultExtractor._grabPropertyDetails(resultList[i]);

                    // Update the UI
                    ResultExtractor._updateCurrProperty(i + 1);
                } catch (e) {
                    // Save this error property
                    ResultExtractor._errorProperties.push($(resultList[i]).text() + ' - ' + resultList[i].href);
                }
            }

            // Check for a user override
            if (ResultExtractor._forceGenerateMap) return;

            try {
                // Force the server to return to the search page (thanks backend)
                let searchPageReq = {
                    type: "GET",
                    url: 'https://www.homes.mil/homes/DispatchServlet/HomesPropertySearch',
                    dataType: 'text',
                    error: async (a, b, error) => {

                        // Check for a user override
                        if (ResultExtractor._forceGenerateMap) return;

                        if (searchPageReq.retries++ <= 5) {
                            // Sleep for a bit
                            await ResultExtractor.sleep(1250);

                            await $.ajax(searchPageReq);
                            return;
                        }

                        // Unexpected
                        console.log(error);
                        alert('Could not load property search page after ' + searchPageReq.retries + ' tries, stopping further result extraction!');
                        throw new Error('STOP_RUN');
                    },
                    retries: 0,
                };

                // Make the request for the search page (reset the server side)
                await $.ajax(searchPageReq);

            } catch(e) {
                if (e === 'STOP_RUN') return;

                // Otherwise expected to fail
            }

            // Update the page loaded value
            ResultExtractor._updateCurrPage(resultParsed);

            // Update the offset
            offset += 10;

            // Check for a next page
            isLastPage = resultParsed.find("#c8-comp span.ngScrollPadLinks:last").hasClass("ngScrollPadCurrent");

        } while (isLastPage === false);

    }

    static async _grabPropertyDetails(linkElement) {

        let parsedData = null;
        let currRequestObj = {
            type: "GET",
            dataType: 'text',
            error: async (a, b, error) => {

                // Check for a user override
                if (ResultExtractor._forceGenerateMap) return;

                if (currRequestObj.retries++ <= 3) {

                    // Sleep for a bit
                    await ResultExtractor.sleep(1250);

                    await $.ajax(currRequestObj);
                    return;
                }

                // Unexpected
                console.log(error);
                throw new Error("STOP_RUN");
            },
            retries: 0,
        };

        // Make the request
        currRequestObj = {
            ...currRequestObj,
            url: linkElement.href,
            retries: 0,
        };
        try {
            await $.ajax(currRequestObj);
        } catch (e) {
            if (e === 'STOP_RUN') throw e;
            // Otherwise, expected
        }

        // Make the data request
        currRequestObj = {
            ...currRequestObj,
            url: 'https://www.homes.mil/homes/DispatchServlet/Back?Mod=HomesPropertyDetail',
            success: (data) => {
                // parsedData = $(data);
                parsedData = $($.parseHTML(data));
            },
            retries: 0,
        };
        await $.ajax(currRequestObj);

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

    static _updateCurrProperty(val) {
        $("#ducky-home-tool div.loading span.property-curr").text(val);
    }

    static _updateTotalProperties(val) {
        $("#ducky-home-tool div.loading span.property-total").text(val);
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

        // Show the loading box
        toolDiv.find('div.loading').show();

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