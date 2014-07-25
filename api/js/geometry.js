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
jscut.geometry = jscut.geometry || {};

(function () {
    "use strict";

    // Get the factor to convert units ("inch" or "mm") into geometry coordinates.
    jscut.geometry.getConversion = function (units) {
        if (units == "inch")
            return jscut.priv.path.inchToClipperScale;
        else if (units == "mm")
            return jscut.priv.path.inchToClipperScale / 25.4;
        else {
            console.log("jscut.geometry: units must be 'inch' or 'mm'");
            return Number.NaN;
        }
    }

    // Create empty geometry.
    jscut.geometry.createEmpty = function () {
        return [];
    }

    // Create a rectangle.
    jscut.geometry.createRect = function (x1, y1, x2, y2, units) {
        var conv = jscut.geometry.getConversion(units);
        if (isNaN(conv))
            return [];
        return [[
            { X: x1 * conv, Y: y1 * conv },
            { X: x2 * conv, Y: y1 * conv },
            { X: x2 * conv, Y: y2 * conv },
            { X: x1 * conv, Y: y2 * conv }]];
    }

    // Create a circle.
    jscut.geometry.createCircle = function (x, y, r, numSegments, units) {
        var conv = jscut.geometry.getConversion(units);
        if (isNaN(conv) || numSegments < 3)
            return [];
        x *= conv;
        y *= conv;
        r *= conv;
        var result = [];
        for (var i = 0; i < numSegments; ++i)
            result.push({
                X: x + r * Math.cos(2 * Math.PI * i / numSegments),
                Y: y + r * Math.sin(2 * Math.PI * i / numSegments)
            });
        return [result];
    }

    // Transform geometry. Returns new geometry.
    jscut.geometry.transform = function (matrix, geometry) {
        var result = [];
        for (var i = 0; i < geometry.length; ++i) {
            var subGeom = geometry[i];
            var newSubGeom = [];
            for (var j = 0; j < subGeom.length; ++j) {
                var point = subGeom[j];
                newSubGeom.push({
                    X: matrix[0][0] * point.X + matrix[0][1] * point.Y + matrix[0][2],
                    Y: matrix[1][0] * point.X + matrix[1][1] * point.Y + matrix[1][2]
                });
            }
            result.push(newSubGeom);
        }
        return result;
    }

    // Translate geometry. Returns new geometry.
    jscut.geometry.translate = function (geometry, dx, dy, units) {
        var conv = jscut.geometry.getConversion(units);
        if (isNaN(conv))
            return [];
        var matrix = [
            [1, 0, dx * conv],
            [0, 1, dy * conv]];
        return jscut.geometry.transform(matrix, geometry);
    }

    // Scale geometry. Returns new geometry.
    jscut.geometry.scale = function (geometry, scaleX, scaleY) {
        var matrix = [
            [scaleX, 0, 0],
            [0, scaleY, 0]];
        return jscut.geometry.transform(matrix, geometry);
    }

    // Rotate geometry. units is "deg" or "rad". Returns new geometry.
    jscut.geometry.rotate = function (geometry, angle, units) {
        var convertedAngle;
        if (units == "deg")
            convertedAngle = angle * Math.PI / 180;
        else if (units == "rad")
            convertedAngle = angle;
        else {
            console.log("jscut.geometry.rotate: units must be 'deg' or 'rad'");
            return [];
        }
        var matrix = [
            [Math.cos(convertedAngle), -Math.sin(convertedAngle), 0],
            [Math.sin(convertedAngle), Math.cos(convertedAngle), 0]];
        return jscut.geometry.transform(matrix, geometry);
    }

    // Grow geometry by distance. Negative distance shrinks.
    // join is "square", "round", or "miter". Returns new geometry.
    jscut.geometry.grow = function (geometry, distance, units, join) {
        var conv = jscut.geometry.getConversion(units);
        if(join=='square')
            join = ClipperLib.JoinType.jtSquare;
        else if(join=='round')
            join = ClipperLib.JoinType.jtRound;
        else if(join=='miter')
            join = ClipperLib.JoinType.jtMiter;
        else {
            console.log("jscut.geometry.grow: join must be 'square', 'round', or 'miter'");
            return [];
        }
        if (isNaN(conv))
            return [];
        return jscut.priv.path.offset(geometry, distance * conv, join);
    }

    // Intersect geometry. Returns new geometry.
    jscut.geometry.intersect = function (geometry1, geometry2) {
        return jscut.priv.path.clip(geometry1, geometry2, ClipperLib.ClipType.ctIntersection);
    }

    // Union geometry. Returns new geometry.
    jscut.geometry.union = function (geometry1, geometry2) {
        return jscut.priv.path.clip(geometry1, geometry2, ClipperLib.ClipType.ctUnion);
    }

    // Difference geometry. Returns new geometry.
    jscut.geometry.difference = function (geometry1, geometry2) {
        return jscut.priv.path.clip(geometry1, geometry2, ClipperLib.ClipType.ctDifference);
    }

    // Xor geometry. Returns new geometry.
    jscut.geometry.xor = function (geometry1, geometry2) {
        return jscut.priv.path.clip(geometry1, geometry2, ClipperLib.ClipType.ctXor);
    }

    // Convert geometry to SVG path data format ('d' attribute). Closes each path if
    // closePaths is true. closePaths defaults to true; set it to false it you're
    // converting CAM paths.
    jscut.geometry.toSvgPathData = function (geometry, pxPerInch, closePaths) {
        if (typeof closePaths == 'undefined')
            closePaths = true;
        var scale = pxPerInch / jscut.priv.path.inchToClipperScale;
        var result = "";
        for (var i = 0; i < geometry.length; ++i) {
            var subGeom = geometry[i];
            for (var j = 0; j < subGeom.length; ++j) {
                var point = subGeom[j];
                if (j == 0)
                    result += "M ";
                else
                    result += "L ";
                result += point.X * scale + " " + (-point.Y) * scale + " ";
            }
            if (closePaths)
                result += "Z ";
        }
        return result;
    }

    // Convert geometry to an SVG path object and set attributes. Closes each path if
    // closePaths is true. closePaths defaults to true; set it to false it you're
    // converting CAM paths.
    jscut.geometry.toSvgPathObject = function (geometry, pxPerInch, attributes, closePaths) {
        var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute('d', jscut.geometry.toSvgPathData(geometry, pxPerInch, closePaths));
        for (var k in attributes)
            path.setAttribute(k, attributes[k]);
        return path;
    }
})();
