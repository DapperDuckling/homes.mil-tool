class ResultExtractor {

    static TOOL_ID = 'ducky-move-tool';

    // Entrypoint into the result extractor tool
    static init() {

        // Checks for magic text on page to determine suitability of loading
        let foundMagicText = $("div.ngComp.h2a").text().includes("Property Search Results");
        if (!foundMagicText) return;

        // Display the extract tool button
        this._createToolButton();
    }

    static _createToolButton() {
        // Check to see if the button exists already
        if ($("#" + this.TOOL_ID).length > 0) return;

        // // Create the wrapper
        // let wrapperDiv = $("<div id='ducky-move-tool3'></div>").appendTo("body");

        // Stylize the wrapper
        $.get(chrome.extension.getURL('/tool.html'), function(data) {
            $(data).appendTo('body');
        });
    }

}

ResultExtractor.init();
