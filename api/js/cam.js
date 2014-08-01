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

var jscut = jscut || {};
jscut.cam = jscut.cam || {};

(function () {
    "use strict";

    // Get combined geometry for operation. This uses operation.combineOp to combine multiple geometries in operation.geometries.
    jscut.cam.getCombinedGeometry = function (operation) {
        operation = jscut.data.cleanOperation(operation);

        var combineFn;
        if (operation.combineOp == 'Union')
            combineFn = jscut.geometry.union;
        else if (operation.combineOp == 'Intersect')
            combineFn = jscut.geometry.intersect;
        else if (operation.combineOp == 'Diff')
            combineFn = jscut.geometry.difference;
        else if (operation.combineOp == 'Xor')
            combineFn = jscut.geometry.xor;
        else {
            console.log("jscut.cam.getCombinedGeometry: operation.combineOp must be 'Union', 'Intersect', 'Diff', or 'Xor'");
            return [];
        }

        if (operation.geometries.length == 0)
            return [];

        var result = operation.geometries[0];
        for (var i = 1; i < operation.geometries.length; ++i)
            result = combineFn(result, operation.geometries[i]);
        return result;
    }

    // Get preview geometry for operation
    jscut.cam.getPreviewGeometry = function (operation, tool) {
        operation = jscut.data.cleanOperation(operation);
        tool = jscut.data.cleanTool(tool);

        var result = jscut.cam.getCombinedGeometry(operation);

        var grow = operation.margin;
        if (operation.camOp == "Pocket" || operation.camOp == "Inside")
            grow = -grow;
        if (operation.camOp != "Engrave" && grow != 0)
            result = jscut.geometry.grow(result, grow, operation.units, 'round');

        if (operation.camOp == "Inside" || operation.camOp == "Outside" || operation.camOp == "Engrave") {
            var width = jscut.data.getInchConversion(operation.units) * operation.width;
            var diameter = jscut.data.getInchConversion(tool.units) * tool.diameter;
            if (width < diameter || operation.camOp == "Engrave")
                width = diameter;
            if (operation.camOp == "Inside")
                result = jscut.geometry.difference(result, jscut.geometry.grow(result, -width, 'inch', 'round'));
            else if (operation.camOp == "Outside")
                result = jscut.geometry.difference(jscut.geometry.grow(result, width, 'inch', 'round'), result);
            else
                result = jscut.geometry.difference(
                    jscut.geometry.grow(result, width / 2, 'inch', 'round'),
                    jscut.geometry.grow(result, -width / 2, 'inch', 'round'));
        }

        return result;
    }

    // Get cam paths for operation.
    // Each cam path has this format: {
    //      path:               Path data (geometry format)
    //      safeToClose:        Is it safe to close the path without retracting?
    // }
    jscut.cam.getCamPaths = function (operation, tool) {
        operation = jscut.data.cleanOperation(operation);
        tool = jscut.data.cleanTool(tool);

        var geometry = jscut.cam.getCombinedGeometry(operation);

        var grow = operation.margin;
        if (operation.camOp == "Pocket" || operation.camOp == "Inside")
            grow = -grow;
        if (operation.camOp != "Engrave" && grow != 0)
            geometry = jscut.geometry.grow(geometry, grow, operation.units, 'round');

        var diameter = jscut.geometry.getConversion(tool.units) * tool.diameter;

        if (operation.camOp == "Pocket")
            return jscut.priv.cam.pocket(geometry, diameter, 1 - tool.stepover, operation.direction == "Climb");
        else if (operation.camOp == "Inside" || operation.camOp == "Outside") {
            var width = jscut.geometry.getConversion(operation.units) * operation.width;
            if (width < diameter)
                width = diameter;
            return jscut.priv.cam.outline(geometry, diameter, operation.camOp == "Inside", width, 1 - tool.stepover, operation.direction == "Climb");
        }
        else if (operation.camOp == "Engrave")
            return jscut.priv.cam.engrave(geometry, operation.direction == "Climb");
        else {
            console.log("jscut.cam.getPaths: operation.camOp must be 'Pocket', 'Inside', 'Outside', or 'Engrave'");
            return [];
        }
    }

    // Convert cam paths to SVG path data format ('d' attribute).
    jscut.cam.toSvgPathData = function (camPaths, pxPerInch) {
        var paths = [];
        for (var i = 0; i < camPaths.length; ++i)
            paths.push(camPaths[i].path);
        return jscut.geometry.toSvgPathData(paths, pxPerInch, false);
    }

    // Get gcode header
    jscut.cam.getGcodeHeader = function (tool, material, gcodeOptions) {
        tool = jscut.data.cleanTool(tool);
        material = jscut.data.cleanMaterial(material);
        gcodeOptions = jscut.data.cleanGcodeOptions(gcodeOptions);

        var fromToolConv = jscut.data.getInchConversion(tool.units);
        var fromMatConv = jscut.data.getInchConversion(material.units);
        var toGcodeConv = 1 / jscut.data.getInchConversion(gcodeOptions.units);

        var topZ = 0;
        if (material.zOrigin != "Top")
            topZ = material.thickness * fromMatConv * toGcodeConv;

        var gcode = "";
        if (gcodeOptions.units == "inch")
            gcode += "G20         ; Set units to inches\r\n";
        else
            gcode += "G21         ; Set units to mm\r\n";
        gcode += "G90         ; Absolute positioning\r\n";
        gcode += "G1 Z" + (topZ + material.clearance * fromMatConv * toGcodeConv) +
            " F" + tool.rapidRate * fromToolConv * toGcodeConv + "      ; Move to clearance level\r\n"
        return gcode;
    }

    // Get gcode for operation.
    jscut.cam.getOperationGcode = function (opIndex, operation, tool, material, gcodeOptions, camPaths) {
        operation = jscut.data.cleanOperation(operation);
        tool = jscut.data.cleanTool(tool);
        material = jscut.data.cleanMaterial(material);
        gcodeOptions = jscut.data.cleanGcodeOptions(gcodeOptions);

        var fromOpConv = jscut.data.getInchConversion(operation.units);
        var fromToolConv = jscut.data.getInchConversion(tool.units);
        var fromMatConv = jscut.data.getInchConversion(material.units);
        var toGcodeConv = 1 / jscut.data.getInchConversion(gcodeOptions.units);

        var topZ = 0;
        var botZ = -operation.cutDepth * fromOpConv * toGcodeConv;
        if (material.zOrigin != "Top") {
            topZ = material.thickness * fromMatConv * toGcodeConv;
            botZ = topZ + botZ;
        }
        
        var gcode =
            "\r\n;" +
            "\r\n; Operation:    " + opIndex +
            "\r\n; Name:         " + operation.name +
            "\r\n; Type:         " + operation.camOp +
            "\r\n; Paths:        " + camPaths.length +
            "\r\n; Direction:    " + operation.direction +
            "\r\n; Cut Depth:    " + operation.cutDepth * fromOpConv * toGcodeConv +
            "\r\n; Pass Depth:   " + tool.passDepth * fromToolConv * toGcodeConv +
            "\r\n; Plunge rate:  " + tool.plungeRate * fromToolConv * toGcodeConv +
            "\r\n; Cut rate:     " + tool.cutRate * fromToolConv * toGcodeConv +
            "\r\n;\r\n";

        gcode += jscut.priv.cam.getGcode({
            paths: camPaths,
            ramp: operation.ramp,
            scale: 1 / jscut.geometry.getConversion(gcodeOptions.units),
            offsetX: gcodeOptions.offsetX,
            offsetY: gcodeOptions.offsetY,
            decimal: 4,
            topZ: topZ,
            botZ: botZ,
            safeZ: topZ + material.clearance * fromMatConv * toGcodeConv,
            passDepth: tool.passDepth * fromToolConv * toGcodeConv,
            plungeFeed: tool.plungeRate * fromToolConv * toGcodeConv,
            retractFeed: tool.rapidRate * fromToolConv * toGcodeConv,
            cutFeed: tool.cutRate * fromToolConv * toGcodeConv,
            rapidFeed: tool.rapidRate * fromToolConv * toGcodeConv,
        });
        return gcode;
    }
})();
