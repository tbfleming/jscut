// Copyright 2014 Todd Fleming
//
// This file is part of jscut.
//
// jscut is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// jscut is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with jscut.  If not, see <http://www.gnu.org/licenses/>.

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
            diameterClipper: self.diameter.toInch() * Path.inchToClipperScale,
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

function Operation(svgViewModel, materialViewModel, operationsViewModel, toolModel, combinedGeometryGroup, toolPathsGroup, rawPaths) {
    var self = this;
    self.materialViewModel = materialViewModel;
    self.rawPaths = rawPaths;
    self.enabled = ko.observable(true);
    self.selected = ko.observable("off");
    self.combineOp = ko.observable("Union");
    self.camOp = ko.observable("Pocket");
    self.cutDepth = ko.observable(0);
    self.margin = ko.observable("0.0");
    self.width = ko.observable("0.0");
    self.combinedGeometry = [];
    self.combinedGeometrySvg = null;
    self.toolPaths = ko.observable([]);
    self.toolPathSvg = null;

    materialViewModel.unitConverter.add(self.cutDepth);
    materialViewModel.unitConverter.add(self.margin);
    materialViewModel.unitConverter.add(self.width);

    self.cutDepth.fromInch(toolModel.passDepth.toInch());

    self.removeCombinedGeometrySvg = function() {
        if (self.combinedGeometrySvg) {
            self.combinedGeometrySvg.remove();
            self.combinedGeometrySvg = null;
        }
    }

    self.removeToolPaths = function() {
        if (self.toolPathSvg) {
            self.toolPathSvg.remove();
            self.toolPathSvg = null;
            self.toolPaths([]);
        }
    }

    self.selected.subscribe(function (newValue) {
        if (newValue == "on")
            operationsViewModel.selectedOperation(self);
    });

    operationsViewModel.selectedOperation.subscribe(function () {
        self.selected(operationsViewModel.selectedOperation() === self ? "on" : "off");
    });

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
        self.removeToolPaths();

        var all = [];
        for (var i = 0; i < self.rawPaths.length; ++i) {
            var geometry = Path.getClipperPathsFromSnapPath(self.rawPaths[i], svgViewModel.pxPerInch(), function (msg) {
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

        var previewGeometry = self.combinedGeometry;

        if (previewGeometry.length != 0) {
            var offset = self.margin.toInch() * Path.inchToClipperScale;
            if (self.camOp() == "Pocket")
                offset = -offset;
            if (offset != 0)
                previewGeometry = Path.offset(previewGeometry, offset);

            if (self.camOp() == "Outline") {
                var toolCamArgs = toolModel.getCamArgs();
                if (toolCamArgs != null) {
                    var width = self.width.toInch() * Path.inchToClipperScale;
                    if (width < toolCamArgs.diameterClipper)
                        width = toolCamArgs.diameterClipper;
                    self.toolPaths(Cam.outline(geometry, toolCamArgs.diameterClipper, width, toolCamArgs.overlap));
                    previewGeometry = Path.diff(Path.offset(previewGeometry, width), previewGeometry);
                }
            }
        }

        if (previewGeometry.length != 0) {
            var path = Path.getSnapPathFromClipperPaths(previewGeometry, svgViewModel.pxPerInch());
            if (path != null)
                self.combinedGeometrySvg = combinedGeometryGroup.path(path).attr("class", "combinedGeometry");
        }

        self.enabled(true);
    }

    toolModel.overlap.subscribe(self.removeToolPaths);

    toolModel.diameter.subscribe(self.recombine);
    svgViewModel.pxPerInch.subscribe(self.recombine);
    self.combineOp.subscribe(self.recombine);
    self.camOp.subscribe(self.recombine);
    self.margin.subscribe(self.recombine);
    self.width.subscribe(self.recombine);
    self.recombine();

    self.generateToolPath = function () {
        self.removeToolPaths();

        var toolCamArgs = toolModel.getCamArgs();
        if (toolCamArgs == null)
            return;

        var geometry = self.combinedGeometry;
        var offset = self.margin.toInch() * Path.inchToClipperScale;
        if (self.camOp() == "Pocket")
            offset = -offset;
        if (offset != 0)
            geometry = Path.offset(geometry, offset);

        if (self.camOp() == "Pocket")
            self.toolPaths(Cam.pocket(geometry, toolCamArgs.diameterClipper, toolCamArgs.overlap));
        else if (self.camOp() == "Outline") {
            var width = self.width.toInch() * Path.inchToClipperScale;
            if (width < toolCamArgs.diameterClipper)
                width = toolCamArgs.diameterClipper;
            self.toolPaths(Cam.outline(geometry, toolCamArgs.diameterClipper, width, toolCamArgs.overlap));
        }
        var path = Path.getSnapPathFromClipperPaths(Cam.getClipperPathsFromCamPaths(self.toolPaths()), svgViewModel.pxPerInch());
        if (path != null && path.length > 0) {
            self.toolPathSvg = toolPathsGroup.path(path).attr("class", "toolPath");
            tutorial(5, 'After you finished adding and editing toolpaths, click "Generate Gcode"');
        }
        self.enabled(true);
    }

    self.selected("on");
}

function OperationsViewModel(svgViewModel, materialViewModel, selectionViewModel, toolModel, combinedGeometryGroup, toolPathsGroup) {
    var self = this;
    self.svgViewModel = svgViewModel;
    self.operations = ko.observableArray();
    self.selectedOperation = ko.observable();
    self.minX = ko.observable(0);
    self.minY = ko.observable(0);
    self.maxX = ko.observable(0);
    self.maxY = ko.observable(0);

    function findMinMax() {
        var minX = 0, maxX = 0, minY = 0, maxY = 0;
        var foundFirst = false;
        var ops = self.operations();
        for (var i = 0; i < ops.length; ++i) {
            if (ops[i].enabled() && ops[i].toolPaths() != null) {
                var toolPaths = ops[i].toolPaths();
                for (var j = 0; j < toolPaths.length; ++j) {
                    var toolPath = toolPaths[j].path;
                    for (var k = 0; k < toolPath.length; ++k) {
                        var point = toolPath[k];
                        if (!foundFirst) {
                            minX = point.X;
                            maxX = point.X;
                            minY = point.Y;
                            maxY = point.Y;
                            foundFirst = true;
                        }
                        else {
                            minX = Math.min(minX, point.X);
                            minY = Math.min(minY, point.Y);
                            maxX = Math.max(maxX, point.X);
                            maxY = Math.max(maxY, point.Y);
                        }
                    }
                }
            }
        }
        self.minX(minX);
        self.maxX(maxX);
        self.minY(minY);
        self.maxY(maxY);
    }

    self.addOperation = function () {
        rawPaths = [];
        selectionViewModel.getSelection().forEach(function (element) {
            rawPaths.push(Snap.parsePathString(element.attr('d')));
        });
        selectionViewModel.clearSelection();
        var op = new Operation(svgViewModel, materialViewModel, self, toolModel, combinedGeometryGroup, toolPathsGroup, rawPaths);
        self.operations.push(op);
        op.enabled.subscribe(findMinMax);
        op.toolPaths.subscribe(findMinMax);
        tutorial(4, 'Change settings in "Material," "Tool," and "Selected Operation" then click "Generate Toolpath".');
    }

    self.removeOperation = function (operation) {
        operation.removeCombinedGeometrySvg();
        operation.removeToolPaths();
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
