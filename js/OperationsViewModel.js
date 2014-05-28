// Copyright 2014 Todd Fleming

function ToolModel() {
    var self = this;
    self.units = ko.observable("inch");
    self.unitConverter = new UnitConverter(self.units);
    self.diameter = ko.observable(.125);
    self.passDepth = ko.observable(.125);
    self.overlap = ko.observable(.4);
    self.rapidRate = ko.observable(100);
    self.plungeRate = ko.observable(20);
    self.cutRate = ko.observable(40);

    self.unitConverter.add(self.diameter);
    self.unitConverter.add(self.passDepth);
    self.unitConverter.add(self.rapidRate);
    self.unitConverter.add(self.plungeRate);
    self.unitConverter.add(self.cutRate);

    self.getCamArgs = function () {
        result = {
            diameterClipper: self.diameter.toPx() * Path.snapToClipperScale,
            overlap: Number(self.overlap()),
        };
        if (result.diameterClipper <= 0) {
            showAlert("Tool diameter must be greater than 0", "alert-danger");
            return null;
        }
        if (result.overlap < 0) {
            showAlert("Tool overlap must be at least 0", "alert-danger");
            return null;
        }
        if (result.overlap >= 1) {
            showAlert("Tool overlap must be less than 1", "alert-danger");
            return null;
        }
        return result;
    }
}

function Operation(operationsViewModel, toolModel, combinedGeometryGroup, toolPathsGroup, rawPaths) {
    var self = this;
    self.rawPaths = rawPaths;
    self.enabled = ko.observable(true);
    self.selected = ko.observable("off");
    self.combineOp = ko.observable("Union");
    self.camOp = ko.observable("Pocket");
    self.combinedGeometry = [];
    self.combinedGeometrySvg = null;
    self.camPaths = [];
    self.toolPathSvg = null;

    self.removeCombinedGeometrySvg = function() {
        if (self.combinedGeometrySvg) {
            self.combinedGeometrySvg.remove();
            self.combinedGeometrySvg = null;
        }
    }

    self.removeToolPathSvg = function() {
        if (self.toolPathSvg) {
            self.toolPathSvg.remove();
            self.toolPathSvg = null;
        }
    }

    self.selected.subscribe(function (newValue) {
        if (newValue == "on")
            operationsViewModel.selectedOperation(self);
    });

    operationsViewModel.selectedOperation.subscribe(function () {
        self.selected(operationsViewModel.selectedOperation() === self ? "on" : "off");
    });

    toolModel.diameter.subscribe(self.removeToolPathSvg);
    toolModel.overlap.subscribe(self.removeToolPathSvg);
    self.camOp.subscribe(self.removeToolPathSvg);

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
        self.removeCombinedGeometrySvg();
        self.removeToolPathSvg();

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
        self.removeToolPathSvg();
        self.camPaths = [];

        toolCamArgs = toolModel.getCamArgs();
        if (toolCamArgs == null)
            return;

        if (self.camOp() == "Pocket")
            self.camPaths = Cam.pocket(self.combinedGeometry, toolCamArgs.diameterClipper, toolCamArgs.overlap);
        else if (self.camOp() == "Outline")
            self.camPaths = Cam.outline(self.combinedGeometry, toolCamArgs.diameterClipper, Path.snapToClipperScale * 30, toolCamArgs.overlap);
        path = Path.getSnapPathFromClipperPaths(Cam.getClipperPathsFromCamPaths(self.camPaths));
        if (path != null && path.length > 0)
            self.toolPathSvg = toolPathsGroup.path(path).attr("class", "toolPath");
        self.enabled(true);
    }

    self.selected("on");
}

function OperationsViewModel(selectionViewModel, toolModel, combinedGeometryGroup, toolPathsGroup) {
    var self = this;
    self.operations = ko.observableArray();
    self.selectedOperation = ko.observable();

    self.addOperation = function () {
        rawPaths = [];
        selectionViewModel.getSelection().forEach(function (element) {
            rawPaths.push(Snap.parsePathString(element.attr('d')));
        });
        selectionViewModel.clearSelection();
        self.operations.push(new Operation(self, toolModel, combinedGeometryGroup, toolPathsGroup, rawPaths));
    }

    self.removeOperation = function (operation) {
        operation.removeCombinedGeometrySvg();
        operation.removeToolPathSvg();
        var i = self.operations.indexOf(operation);
        self.operations.remove(operation);
        if (i < self.operations().length)
            self.selectedOperation(self.operations()[i]);
        else if (self.operations().length > 0)
            self.selectedOperation(self.operations()[self.operations().length - 1]);
        else
            self.selectedOperation(null);
    }

    self.clickOnSvg = function (elem) {
        if (elem.attr("class") == "combinedGeometry" || elem.attr("class") == "toolPath")
            return true;
        return false;
    }
}
