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

function GcodeConversionViewModel(options, miscViewModel, materialViewModel, toolModel, operationsViewModel, tabsViewModel) {
    "use strict";
    var self = this;
    var allowGen = true;
    self.miscViewModel = miscViewModel;
    self.units = ko.observable("mm");
    self.unitConverter = new UnitConverter(self.units);
    self.gcode = ko.observable("");
    self.gcodeFilename = ko.observable("gcode.gcode");
    self.offsetX = ko.observable(0);
    self.offsetY = ko.observable(0);
    self.returnTo00 = ko.observable(false);

    self.unitConverter.add(self.offsetX);
    self.unitConverter.add(self.offsetY);

    self.minX = ko.computed(function () {
        return (self.unitConverter.fromInch(operationsViewModel.minX() / jscut.priv.path.inchToClipperScale) + Number(self.offsetX())).toFixed(4);
    });
    self.maxX = ko.computed(function () {
        return (self.unitConverter.fromInch(operationsViewModel.maxX() / jscut.priv.path.inchToClipperScale) + Number(self.offsetX())).toFixed(4);
    });
    self.minY = ko.computed(function () {
        return (-self.unitConverter.fromInch(operationsViewModel.maxY() / jscut.priv.path.inchToClipperScale) + Number(self.offsetY())).toFixed(4);
    });
    self.maxY = ko.computed(function () {
        return (-self.unitConverter.fromInch(operationsViewModel.minY() / jscut.priv.path.inchToClipperScale) + Number(self.offsetY())).toFixed(4);
    });

    self.zeroLowerLeft = function () {
        allowGen = false;
        self.offsetX(-self.unitConverter.fromInch(operationsViewModel.minX() / jscut.priv.path.inchToClipperScale));
        self.offsetY(-self.unitConverter.fromInch(-operationsViewModel.maxY() / jscut.priv.path.inchToClipperScale));
        allowGen = true;
        self.generateGcode();
    }

    self.zeroCenter = function () {
        allowGen = false;
        self.offsetX(-self.unitConverter.fromInch((operationsViewModel.minX() + operationsViewModel.maxX()) / 2 / jscut.priv.path.inchToClipperScale));
        self.offsetY(-self.unitConverter.fromInch(-(operationsViewModel.minY() + operationsViewModel.maxY()) / 2 / jscut.priv.path.inchToClipperScale));
        allowGen = true;
        self.generateGcode();
    }

    self.generateGcode = function () {
        if (!allowGen)
            return;

        var startTime = Date.now();
        if (options.profile)
            console.log("generateGcode...");

        var ops = [];
        for (var i = 0; i < operationsViewModel.operations().length; ++i) {
            op = operationsViewModel.operations()[i];
            if (op.enabled()) {
                if (op.toolPaths() != null && op.toolPaths().length > 0)
                    ops.push(op);
            }
        }
        if (ops.length == 0)
            return;

        var safeZ = self.unitConverter.fromInch(materialViewModel.matZSafeMove.toInch());
        var rapidRate = self.unitConverter.fromInch(toolModel.rapidRate.toInch());
        var plungeRate = self.unitConverter.fromInch(toolModel.plungeRate.toInch());
        var cutRate = self.unitConverter.fromInch(toolModel.cutRate.toInch());
        var passDepth = self.unitConverter.fromInch(toolModel.passDepth.toInch());
        var topZ = self.unitConverter.fromInch(materialViewModel.matTopZ.toInch());
        var tabCutDepth = self.unitConverter.fromInch(tabsViewModel.maxCutDepth.toInch());
        var tabZ = topZ - tabCutDepth;

        if(passDepth <= 0) {
            showAlert("Pass Depth is not greater than 0.", "alert-danger");
            return;
        }

        var scale;
        if(self.units() == "inch")
            scale = 1 / jscut.priv.path.inchToClipperScale;
        else
            scale = 25.4 / jscut.priv.path.inchToClipperScale;

        var tabGeometry = [];
        for (var i = 0; i < tabsViewModel.tabs().length; ++i) {
            var tab = tabsViewModel.tabs()[i];
            if (tab.enabled()) {
                var offset = toolModel.diameter.toInch() / 2 * jscut.priv.path.inchToClipperScale;
                var geometry = jscut.priv.path.offset(tab.combinedGeometry, offset);
                tabGeometry = jscut.priv.path.clip(tabGeometry, geometry, ClipperLib.ClipType.ctUnion);
            }
        }

        var gcode = "";
        if (self.units() == "inch")
            gcode += "G20         ; Set units to inches\r\n";
        else
            gcode += "G21         ; Set units to mm\r\n";
        gcode += "G90         ; Absolute positioning\r\n";
        gcode += "G1 Z" + safeZ + " F" + rapidRate + "      ; Move to clearance level\r\n"

        for (var opIndex = 0; opIndex < ops.length; ++opIndex) {
            var op = ops[opIndex];
            var cutDepth = self.unitConverter.fromInch(op.cutDepth.toInch());
            if(cutDepth <= 0) {
                showAlert("An operation has a cut depth which is not greater than 0.", "alert-danger");
                return;
            }

            gcode +=
                "\r\n;" +
                "\r\n; Operation:    " + opIndex +
                "\r\n; Name:         " + op.name() +
                "\r\n; Type:         " + op.camOp() +
                "\r\n; Paths:        " + op.toolPaths().length +
                "\r\n; Direction:    " + op.direction() +
                "\r\n; Cut Depth:    " + cutDepth +
                "\r\n; Pass Depth:   " + passDepth +
                "\r\n; Plunge rate:  " + plungeRate +
                "\r\n; Cut rate:     " + cutRate +
                "\r\n;\r\n";

            gcode += jscut.priv.cam.getGcode({
                paths:          op.toolPaths(),
                ramp:           op.ramp(),
                scale:          scale,
                useZ:           op.camOp() == "V Pocket",
                offsetX:        Number(self.offsetX()),
                offsetY:        Number(self.offsetY()),
                decimal:        4,
                topZ:           topZ,
                botZ:           topZ - cutDepth,
                safeZ:          safeZ,
                passDepth:      passDepth,
                plungeFeed:     plungeRate,
                retractFeed:    rapidRate,
                cutFeed:        cutRate,
                rapidFeed:      rapidRate,
                tabGeometry:    tabGeometry,
                tabZ:           tabZ,
            });
        }

        if (self.returnTo00())
            gcode +=
                "\r\n; Return to 0,0\r\n" +
                "G0 X0 Y0 F" + rapidRate + "\r\n";

        gcode += "M2\r\n";
        self.gcode(gcode);

        if (options.profile)
            console.log("generateGcode: " + (Date.now() - startTime));

        if (renderPath) {
            renderPath.fillPathBuffer(
                jscut.parseGcode(options, gcode),
                self.unitConverter.fromInch(materialViewModel.matTopZ.toInch()),
                self.unitConverter.fromInch(toolModel.diameter.toInch()),
                toolModel.angle(),
                self.unitConverter.fromInch(1));
            renderPath.setStopAtTime(renderPath.totalTime);
        }

        tutorial(5, 'You\'re done! Look at the "Simulate GCODE" tab. Save your gcode.');
    }

    self.offsetX.subscribe(self.generateGcode);
    self.offsetY.subscribe(self.generateGcode);
    self.returnTo00.subscribe(self.generateGcode);
    toolModel.angle.subscribe(self.generateGcode);

    self.toJson = function () {
        return {
            'units': self.units(),
            'gcodeFilename': self.gcodeFilename(),
            'offsetX': self.offsetX(),
            'offsetY': self.offsetY(),
        };
    }

    self.fromJson = function (json) {
        function f(j, o) {
            if (typeof j !== "undefined")
                o(j);
        }

        if (json) {
            f(json.units, self.units);
            f(json.gcodeFilename, self.gcodeFilename);
            f(json.offsetX, self.offsetX);
            f(json.offsetY, self.offsetY);
        }
    }
}
