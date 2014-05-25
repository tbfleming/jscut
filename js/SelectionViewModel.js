// Copyright 2014 Todd Fleming

function SelectionViewModel(materialViewModel, selectionGroup) {
    var self = this;

    self.selMinNumSegments = ko.observable("1");
    self.selMinSegmentLength = ko.observable("0.1");
    self.selNumSelected = ko.observable("0");

    materialViewModel.unitConverter.add(self.selMinSegmentLength);

    self.clickOnSvg = function (elem) {
        if (elem.attr("class") == "selectedPath") {
            elem.remove();
            self.selNumSelected(self.selNumSelected() - 1);
            return true;
        }

        var path = Path.getLinearSnapPathFromElement(elem, self.selMinNumSegments(), self.selMinSegmentLength.toPx(), function (msg) {
            showAlert(msg, "alert-warning");
        });

        if (path != null) {
            selectionGroup.path(path).attr("class", "selectedPath");
            self.selNumSelected(self.selNumSelected() + 1);
        }

        return true;
    }

    self.getSelection = function () {
        return selectionGroup.selectAll("Path");
    }

    self.clearSelection = function () {
        selectionGroup.selectAll("Path").remove();
    }
}
