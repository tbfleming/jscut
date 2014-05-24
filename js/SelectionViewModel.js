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

        var path = Path.getLinearSnapPathFromElement(elem, this.selMinNumSegments(), this.selMinSegmentLength() / mmPerInch * svgPxPerInch, function (msg) {
            showAlert(msg, "alert-warning");
        });

        if (path != null) {
            selectionGroup.path(path).attr({ "SelectedPath": "true", "style": "fill:#0000ff" });
            this.selNumSelected(this.selNumSelected() + 1);
        }

        var clipperPaths;
        if (path != null)
            clipperPaths = Path.getClipperPathsFromSnapPath(path, function (msg) {
                showAlert(msg, "alert-warning");
            });

        if (clipperPaths != null) {
            clipperPaths = ClipperLib.Clipper.CleanPolygons(clipperPaths, Path.cleanPolyDist);
            clipperPaths = ClipperLib.Clipper.SimplifyPolygons(clipperPaths, ClipperLib.PolyFillType.pftEvenOdd);

            var co = new ClipperLib.ClipperOffset(2, Path.arcTolerance);
            co.AddPaths(clipperPaths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
            var offsetted = [];
            co.Execute(offsetted, -Path.snapToClipperScale * 10);

            path = Path.getSnapPathFromClipperPaths(offsetted);
            if (path != null)
                selectionGroup.path(path).attr({ "style": "fill:#00ff00" });
        }
    }
}
