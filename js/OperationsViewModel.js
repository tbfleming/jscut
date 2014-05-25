// Copyright 2014 Todd Fleming

function Operation(operationGroup, type, rawPaths) {
    var self = this;
    self.type = ko.observable(type);
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
                all.push(Cam.simplifyAndClean(geometry));
        }

        if (all.length == 0)
            self.combinedGeometry = [];
        else {
            self.combinedGeometry = all[0];
            for(var i = 1; i < all.length; ++i) {
                var clipper = new ClipperLib.Clipper();
                clipper.AddPaths(self.combinedGeometry, ClipperLib.PolyType.ptSubject, true);
                clipper.AddPaths(all[i], ClipperLib.PolyType.ptClip, true);
                self.combinedGeometry = [];
                var clipType = ClipperLib.ClipType.ctUnion;
                if (self.combineOp() == "Intersect")
                    clipType = ClipperLib.ClipType.ctIntersection;
                else if (self.combineOp() == "Diff")
                    clipType = ClipperLib.ClipType.ctDifference;
                else if (self.combineOp() == "Xor")
                    clipType = ClipperLib.ClipType.ctXor;
                clipper.Execute(clipType, self.combinedGeometry, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);
            }
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
        self.toolPath = Cam.pocket(self.combinedGeometry, Path.snapToClipperScale * 5, 0);
        path = Path.getSnapPathFromClipperPaths(self.toolPath);
        if (path != null)
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
        self.operations.push(new Operation(operationGroup, "Pocket", rawPaths));
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
