// Copyright 2014 Todd Fleming

function SelectionViewModel(selectionGroup) {
    svgPxPerInch = 90;
    mmPerInch = 25.4;

    this.selMinNumSegments = ko.observable("1");
    this.selMinSegmentLength = ko.observable("20");
    this.selNumSelected = ko.observable("0");

    this.toggleSelect = function(elem) {
        if (elem.attr("SelectedPath") == "true") {
            elem.remove();
            this.selNumSelected(this.selNumSelected() - 1);
            return;
        }

        var path = getLinearSnapPathFromElement(elem, this.selMinNumSegments(), this.selMinSegmentLength() / mmPerInch * svgPxPerInch, function (msg) {
            showAlert(msg, "alert-warning");
        });

        if (path != null) {
            selectionGroup.path(path).attr({ "SelectedPath": "true", "style": "fill:#0000ff" });
            this.selNumSelected(this.selNumSelected() + 1);
        }
    }
}
