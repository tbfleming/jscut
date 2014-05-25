// Copyright 2014 Todd Fleming

function SelectionViewModel(selectionGroup) {
    var self = this;
    svgPxPerInch = 90;
    mmPerInch = 25.4;

    self.selMinNumSegments = ko.observable("1");
    self.selMinSegmentLength = ko.observable("0.1");
    self.selNumSelected = ko.observable("0");

    self.clickOnSvg = function (elem) {
        if (elem.attr("class") == "selectedPath") {
            elem.remove();
            self.selNumSelected(self.selNumSelected() - 1);
            return true;
        }

        var path = Path.getLinearSnapPathFromElement(elem, self.selMinNumSegments(), self.selMinSegmentLength() / mmPerInch * svgPxPerInch, function (msg) {
            showAlert(msg, "alert-warning");
        });

        if (path != null) {
            selectionGroup.path(path).attr("class", "selectedPath");
            self.selNumSelected(self.selNumSelected() + 1);
        }
/*
        var clipperPaths;
        if (path != null)
            clipperPaths = Path.getClipperPathsFromSnapPath(path, function (msg) {
                showAlert(msg, "alert-warning");
            });

        if (clipperPaths != null) {
            cutterPath = Cam.pocket(clipperPaths, Path.snapToClipperScale * 5, 0);
            path = Path.getSnapPathFromClipperPaths(cutterPath);
            if (path != null)
                selectionGroup.path(path).attr("class", "toolPath");
        }
*/

        return true;
    }

    self.getSelection = function () {
        return selectionGroup.selectAll("Path");
    }
}
