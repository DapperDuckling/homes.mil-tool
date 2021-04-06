class ResultExtractor {

    static _isRunning = false;
    static _forceGenerateMap = false; // Did the user forcibly request a map with the current dataset

    // Entrypoint into the result extractor tool
    static init() {

        // Checks for magic text on page to determine suitability of loading
        let foundMagicText = $("div.ngComp.h2a").text().includes("Property Search Results");
        if (!foundMagicText) return;

        // Grab the extract button
        let extractButton = $('#ducky-home-tool button._extract');

        // Display the extract tool button
        extractButton.show();

        // Bind the button to the extract event
        extractButton.one('click', this._extract);

        // Make the loading box draggable
        $('#ducky-home-tool div.loading').draggable();

    }

    static _resetTool() {

    }

    /**
     * Handles pulling the result data from each available page
     * @private
     */
    static async _loadResultData() {

        let hasNextPage = true;
        let offset = 0;

        while (hasNextPage) {

            // Request result page
            await $.ajax({
                type: "GET",
                url: "/homes/DispatchServlet/Back?Mod=top&OFFSET=" + offset,
                error: () => {
                    // Expected due to server-side redirects to http instead of https
                }
            });

            //

            // Update the offset
            offset += 10;
        }


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

        // Grab the tool div
        let toolDiv = $('#ducky-home-tool');

        // Disable the extract button
        toolDiv.find('button._extract').prop('disabled', true);

        // Grab the skip loading button
        let loadingBtn = toolDiv.find('button.generate-map');

        // Bind the skip loading button
        loadingBtn.one('click', () => {
            // Set our forced flag
            ResultExtractor._forceGenerateMap = true;

            // Call the map generator
            ResultExtractor._generateMap();
        });

        // todo: Determine how many pages we are grabbing and update the UI

        // Pull the results
        await this._loadResultData();


        // // Enable the skip loading button
        // loadingBtn.prop('disabled', false);


    }

    static _generateMap() {

    }
}

ResultExtractor.init();