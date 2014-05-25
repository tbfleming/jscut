// Copyright 2014 Todd Fleming

function Operation(operationGroup, type, rawPaths) {
    var self = this;
    self.type = ko.observable(type);
    self.rawPaths = rawPaths;
    self.combineOp = ko.observable("Union");
    self.combinedGeometry = [];
    self.combinedGeometrySvg = null;

    self.recombine = function () {
        if (self.combinedGeometrySvg) {
            self.combinedGeometrySvg.remove();
            self.combinedGeometrySvg = null;
        }

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
}

function OperationsViewModel(selectionViewModel, operationGroup) {
    var self = this;
    self.operations = ko.observableArray();

    self.addOperation = function () {
        rawPaths = [];
        selectionViewModel.getSelection().forEach(function (element) {
            rawPaths.push(Snap.parsePathString(element.attr('d')));
        });
        self.operations.push(new Operation(operationGroup, "Pocket", rawPaths));
    }

    self.removeOperation = function (operation) {
        self.operations.remove(operation);
    }

    self.clickOnSvg = function (elem) {
        if (elem.attr("class") == "combinedGeometry") {
            elem.remove();
            return true;
        }
        return false;
    }
}
