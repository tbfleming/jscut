// Copyright 2014 Todd Fleming

function Operation(operationGroup, rawPaths) {
    var self = this;
    self.type = ko.observable("Pocket");
    self.rawPaths = rawPaths;
    self.combineOp = ko.observable("Union");
    self.combinedGeometry = [];
    self.combinedGeometrySvg = null;
    self.toolPath = [];
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
                self.combinedGeometrySvg = operationGroup.path(path).attr("class", "combinedGeometry");
        }
    }

    self.combineOp.subscribe(self.recombine);
    self.recombine();

    self.generateToolPath = function () {
        removeToolPathSvg();
        self.toolPath = [];
        if (self.type() == "Pocket")
            self.toolPath = Cam.pocket(self.combinedGeometry, Path.snapToClipperScale * 5, 0);
        else if (self.type() == "Outline")
            self.toolPath = Cam.outline(self.combinedGeometry, Path.snapToClipperScale * 5, Path.snapToClipperScale * 30, 0);
        path = Path.getSnapPathFromClipperPaths(self.toolPath);
        if (path != null && path.length > 0)
            self.toolPathSvg = operationGroup.path(path).attr("class", "toolPath");
    }
}

function OperationsViewModel(selectionViewModel, operationGroup) {
    var self = this;
    self.operations = ko.observableArray();

    self.addOperation = function () {
        rawPaths = [];
        selectionViewModel.getSelection().forEach(function (element) {
            rawPaths.push(Snap.parsePathString(element.attr('d')));
        });
        selectionViewModel.clearSelection();
        self.operations.push(new Operation(operationGroup, rawPaths));
    }

    self.removeOperation = function (operation) {
        self.operations.remove(operation);
    }

    self.clickOnSvg = function (elem) {
        if (elem.attr("class") == "combinedGeometry" || elem.attr("class") == "toolPath") {
            elem.remove();
            return true;
        }
        return false;
    }
}
