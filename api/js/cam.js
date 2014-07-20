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
})();
