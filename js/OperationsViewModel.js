// Copyright 2014 Todd Fleming

function Operation(combinedGeometryGroup, toolPathsGroup, rawPaths) {
    var self = this;
    self.rawPaths = rawPaths;
    self.enabled = ko.observable(true);
    self.combineOp = ko.observable("Union");
    self.camOp = ko.observable("Pocket");
    self.combinedGeometry = [];
    self.combinedGeometrySvg = null;
    self.camPaths = [];
    self.toolPathSvg = null;

    function removeCombinedGeometrySvg() {
        if (self.combinedGeometrySvg) {
            self.combinedGeometrySvg.remove();
            self.combinedGeometrySvg = null;
        }
    }

    function removeToolPathSvg() {
        if (self.toolPathSvg) {
            self.toolPathSvg.remove();
            self.toolPathSvg = null;
        }
    }

    self.camOp.subscribe(removeToolPathSvg);

    self.enabled.subscribe(function (newValue) {
        var v;
        if (newValue)
            v = "visible";
        else
            v = "hidden";
        if (self.combinedGeometrySvg)
            self.combinedGeometrySvg.attr("visibility", v);
        if (self.toolPathSvg)
            self.toolPathSvg.attr("visibility", v);
    });

    self.recombine = function () {
        removeCombinedGeometrySvg();
        removeToolPathSvg();

        var all = [];
        for (var i = 0; i < self.rawPaths.length; ++i) {
            var geometry = Path.getClipperPathsFromSnapPath(self.rawPaths[i], function (msg) {
                showAlert(msg, "alert-warning");
            });
            if (geometry != null)
                all.push(Path.simplifyAndClean(geometry));
        }

        if (all.length == 0)
            self.combinedGeometry = [];
        else {
            self.combinedGeometry = all[0];
            var clipType = ClipperLib.ClipType.ctUnion;
            if (self.combineOp() == "Intersect")
                clipType = ClipperLib.ClipType.ctIntersection;
            else if (self.combineOp() == "Diff")
                clipType = ClipperLib.ClipType.ctDifference;
            else if (self.combineOp() == "Xor")
                clipType = ClipperLib.ClipType.ctXor;
            for (var i = 1; i < all.length; ++i)
                self.combinedGeometry = Path.clip(self.combinedGeometry, all[i], clipType);
        }

        if (self.combinedGeometry.length != 0) {
            path = Path.getSnapPathFromClipperPaths(self.combinedGeometry);
            if (path != null)
                self.combinedGeometrySvg = combinedGeometryGroup.path(path).attr("class", "combinedGeometry");
        }

        self.enabled(true);
    }

    self.combineOp.subscribe(self.recombine);
    self.recombine();

    self.generateToolPath = function () {
        removeToolPathSvg();
        self.camPaths = [];
        if (self.camOp() == "Pocket")
            self.camPaths = Cam.pocket(self.combinedGeometry, Path.snapToClipperScale * 5, 0);
        else if (self.camOp() == "Outline")
            self.camPaths = Cam.outline(self.combinedGeometry, Path.snapToClipperScale * 5, Path.snapToClipperScale * 30, 0);
        path = Path.getSnapPathFromClipperPaths(Cam.getClipperPathsFromCamPaths(self.camPaths));
        if (path != null && path.length > 0)
            self.toolPathSvg = toolPathsGroup.path(path).attr("class", "toolPath");
        self.enabled(true);
    }
}

function OperationsViewModel(selectionViewModel, combinedGeometryGroup, toolPathsGroup) {
    var self = this;
    self.operations = ko.observableArray();

    self.addOperation = function () {
        rawPaths = [];
        selectionViewModel.getSelection().forEach(function (element) {
            rawPaths.push(Snap.parsePathString(element.attr('d')));
        });
        selectionViewModel.clearSelection();
        self.operations.push(new Operation(combinedGeometryGroup, toolPathsGroup, rawPaths));
    }

    self.removeOperation = function (operation) {
        self.operations.remove(operation);
    }

    self.clickOnSvg = function (elem) {
        if (elem.attr("class") == "combinedGeometry" || elem.attr("class") == "toolPath")
            return true;
        return false;
    }
}
