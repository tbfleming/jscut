// Copyright 2014 Todd Fleming

function Operation(operationGroup, type, rawPaths) {
    var self = this;
    self.type = ko.observable(type);
    self.rawPaths = rawPaths;
    self.combineOp = ko.observable("Union");
    self.combinedGeometry = [];
    self.combinedGeometrySvg = null;

    self.recombine = function () {
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
        else if (all.length == 1)
            self.combinedGeometry = all[0];
        else {

        }

        if (self.combinedGeometry.length != 0) {
            path = Path.getSnapPathFromClipperPaths(self.combinedGeometry);
            if (path != null)
                self.combinedGeometrySvg = operationGroup.path(path).attr("class", "combinedGeometry");
        }
    }

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
}
