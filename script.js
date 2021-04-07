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
        $('#ducky-home-tool div.loading, #ducky-home-tool div.results').draggable();

        // Bind the override button
        $('#ducky-home-tool button.force-show-results').one('click', ResultExtractor._forceGenerate);

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
                    console.log(e);

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
            isLastPage = resultParsed.find("#c8-comp span.ngScrollPadLinks > :last").hasClass("ngScrollPadCurrent");

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

        //
        // If you can find a more reliable way to scrape data from the page, be my guest. Tag IDs seem to change
        // if pages have more or less information blocks on them...
        //

        // Find address
        let address = parsedData.find('div.ngComp:contains("Address:")').parent().next().text();
        if (address.trim() === "") {
            let addressElem = parsedData.find('a[title="View in Google Maps"]:first');

            address = parsedData.find('a[title="View in Google Maps"]:first').text();
            address += " " + parsedData.find('a[title="View in Google Maps"]:first').parent().parent().next().text();

            if (addressElem.length === 0) {
                // Last ditch, just use what was in the link
                address = linkElement.text;
            }
        }

        // Build our property's object
        let propertyData = {
            listingId: parsedData.find('div.ngComp:contains("Listing ID:")').parent().next().text(),
            name: parsedData.find('div.ngComp:contains("Name:")').parent().next().text() + " " + parsedData.find('div.ngComp:contains("Name:")').parent().nextAll(':eq(1)').text(),
            phone: parsedData.find('div.ngComp:contains("Phone:")').parent().next().text(),
            altPhone: parsedData.find('div.ngComp:contains("Alt Phone::")').parent().next().text(),
            available: parsedData.find('div.ngComp:contains("AVAILABLE:")').parent().next().text(),
            address: address,
            other: parsedData.find('div.ngComp:contains("Other Features")').parent().nextAll(':eq(1)').text(),
            details: {
                type: parsedData.find('#FAC_DISP-comp').text(),
                rpp: parsedData.find('#RPP_DISP-comp').text(),
                privatized: parsedData.find('#PPV_DISP-comp').text(),
                tla: parsedData.find('#TLA_DISP-comp').text(),
                plan: parsedData.find('#REF_PLAN-comp').text(),
                bedrooms: parsedData.find('#BR_NO-comp').text(),
                sqft: parsedData.find('#SQ_FT-comp').text(),
                baths: {
                    full: parsedData.find('#FULL_BATHS-comp').text(),
                    threeQtr: parsedData.find('#THQTR_BATHS-comp').text(),
                    half: parsedData.find('#HALF_BATHS-comp').text(),
                },
                stories: parsedData.find('#STORY_NO-comp').text(),
                units: parsedData.find('#TOTAL_UNITS-comp').text(),
                furnished: parsedData.find('#FURN_DISP-comp').text(),
                ada: parsedData.find('#ADA_DISP-comp').text(),
                smoking: parsedData.find('#SMOKING_DISP-comp').text(),
                yearBuilt: parsedData.find('#YEAR_BUILT-comp').text(),
                occupied: parsedData.find('#OCC_DISP-comp').text(),
                listed: parsedData.find('#DT_LISTED_DISP-comp').text(),
                roommatesAllowed: parsedData.find('#ROOMMATES_DISP-comp').text(),
                pets: parsedData.find('#PETS_DISP-comp').text(),
            },
            costs: {
                term: parsedData.find('#LEASE_DISP-comp').text(),
                monthlyRent: parsedData.find('#RENT_AMT-comp').text(),
                deposit: parsedData.find('#DEPOSIT_AMT-comp').text(),
                petDeposit: parsedData.find('#PET_DEPOSIT_AMT-comp').text(),
                appFee: parsedData.find('APP_FEE-comp').text(),
                applicationViewFee: parsedData.find('#APP_VIEW_FEE-comp').text(),
                creditCheckFee: parsedData.find('#CC_FEE-comp').text(),
                otherFee: parsedData.find('#OTHER_FEE-comp').text(),
                averageUtilities: parsedData.find('#AVG_UTILITY_AMT-comp').text(),
                scraMilClause: parsedData.find('#MIL_CL_DISP-comp').text(),
                inspectionStatus: parsedData.find('#INSP_STATUS_DISP-comp').text(),
            },
            locationDetails: {
                community: parsedData.find('#COMMUNITY_NAME-comp').text(),
                schoolDistrict: parsedData.find('#SCHOOL_DISTRICT-comp').text(),
                distanceToInstallation: parsedData.find('#DIST_TO_INSTALLATION-comp').text(),
                gpsLat: parsedData.find('#GPS_LATITUDE-comp').text(),
                gpsLong: parsedData.find('#GPS_LONGITUDE-comp').text(),
            },
            amenities: {
                appliancesIncl: parsedData.find('span.label:contains("Appliances Included")').parent().next().text(),
                features: parsedData.find('span.label:contains("Features")').parent().next().text(),
                heatingCooling: parsedData.find('span.label:contains("Heating & Cooling")').parent().next().text(),
                parking: parsedData.find('span.label:contains("Parking")').parent().next().text(),
                safetySecurity: parsedData.find('span.label:contains("Safety & Security")').parent().next().text(),
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
        let currPage = Math.ceil(pageInfoMatches[1] / 10) ?? "??";

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
        let totalPages = Math.ceil(pageInfoMatches[3] / 10) ?? "??";

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

        // Hide results
        let resultsElem = $("#ducky-home-tool div.results")
        resultsElem.hide();

        // Grab the tool div
        let toolDiv = $('#ducky-home-tool');

        // Disable the extract button
        toolDiv.find('button.extract').prop('disabled', true);

        // Grab the skip loading button
        let loadingBtn = toolDiv.find('button.force-show-results');

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
            await Promise.any([ResultExtractor._loadResultData(), ResultExtractor._forceGeneratePromise]);
        } catch (e) {
            // Expected if the force generate button is pushed
        }

        // Disable the skip loading button
        loadingBtn.prop('disabled', true);

        // Display the results
        console.log(ResultExtractor._propertyData, ResultExtractor._errorProperties);
        resultsElem.find('#ducky-home-tool textarea.property-data').val(ResultExtractor._propertyData.join("\n"));
        resultsElem.find('textarea.error-properties').val(ResultExtractor._errorProperties.join("\n"));
        resultsElem.show();

    }
}

ResultExtractor.init();