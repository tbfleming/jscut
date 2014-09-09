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
jscut.priv = jscut.priv || {};
jscut.priv.path = jscut.priv.path || {};

(function () {
    "use strict";
    jscut.priv.path.inchToClipperScale = 100000;                           // Scale inch to Clipper
    jscut.priv.path.cleanPolyDist = jscut.priv.path.inchToClipperScale / 100000;
    jscut.priv.path.arcTolerance = jscut.priv.path.inchToClipperScale / 40000;

    // Linearize a cubic bezier. Returns ['L', x2, y2, x3, y3, ...]. The return value doesn't
    // include (p1x, p1y); it's part of the previous segment.
    function linearizeCubicBezier(p1x, p1y, c1x, c1y, c2x, c2y, p2x, p2y, minNumSegments, minSegmentLength) {
        function bez(p0, p1, p2, p3, t) {
            return (1 - t) * (1 - t) * (1 - t) * p0 + 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t * p3;
        }

        if (p1x == c1x && p1y == c1y && p2x == c2x && p2y == c2y)
            return ['L', p2x, p2y];

        var numSegments = minNumSegments;
        while (true) {
            var x = p1x;
            var y = p1y;
            var result = ['L'];
            for (var i = 1; i <= numSegments; ++i) {
                var t = 1.0 * i / numSegments;
                var nextX = bez(p1x, c1x, c2x, p2x, t);
                var nextY = bez(p1y, c1y, c2y, p2y, t);
                if ((nextX - x) * (nextX - x) + (nextY - y) * (nextY - y) > minSegmentLength * minSegmentLength) {
                    numSegments *= 2;
                    result = null;
                    break;
                }
                result.push(nextX, nextY);
                x = nextX;
                y = nextY;
            }
            if (result)
                return result;
        }
    }

    // Linearize a path. Both the input path and the returned path are in snap.svg's format.
    // Calls alertFn with an error message and returns null if there's a problem.
    jscut.priv.path.linearizeSnapPath = function (path, minNumSegments, minSegmentLength, alertFn) {
        if (path.length < 2 || path[0].length != 3 || path[0][0] != 'M') {
            alertFn("Path does not begin with M")
            return null;
        }
        var x = path[0][1];
        var y = path[0][2];
        var result = [path[0]];
        for (var i = 1; i < path.length; ++i) {
            var subpath = path[i];
            if (subpath[0] == 'C' && subpath.length == 7) {
                result.push(linearizeCubicBezier(
                    x, y, subpath[1], subpath[2], subpath[3], subpath[4], subpath[5], subpath[6], minNumSegments, minSegmentLength));
                x = subpath[5];
                y = subpath[6];
            } else if (subpath[0] == 'M' && subpath.length == 3) {
                result.push(subpath);
                x = subpath[1];
                y = subpath[2];
            } else {
                alertFn("Subpath has an unknown prefix: " + subpath[0]);
                return null;
            }
        }
        return result;
    };

    // Get a linear path from an element in snap.svg's format. Calls alertFn with an 
    // error message and returns null if there's a problem. Returns null without calling
    // alertFn if element.type == "svg".
    jscut.priv.path.getLinearSnapPathFromElement = function (element, minNumSegments, minSegmentLength, alertFn) {
        var path = null;

        if (element.type == "svg")
            return null;
        else if (element.type == "path")
            path = element.attr("d");
        else if (element.type == "rect") {
            var x = Number(element.attr("x"));
            var y = Number(element.attr("y"));
            var w = Number(element.attr("width"));
            var h = Number(element.attr("height"));
            path = 'm' + x + ',' + y + ' ' + w + ',' + 0 + ' ' + 0 + ',' + h + ' ' + (-w) + ',' + 0 + ' ' + 0 + ',' + (-h) + ' ';
        }
        else {
            alertFn("<b>" + element.type + "</b> is not supported; try Inkscape's <strong>Object to Path</strong> command");
            return null;
        }

        if (element.attr('clip-path') != "none") {
            alertFn("clip-path is not supported");
            return null;
        }

        if (element.attr('mask') != "none") {
            alertFn("mask is not supported");
            return null;
        }

        if (path == null) {
            alertFn("path is missing");
            return;
        }

        path = Snap.path.map(path, element.transform().globalMatrix);
        path = Snap.parsePathString(path);
        path = jscut.priv.path.linearizeSnapPath(path, minNumSegments, minSegmentLength, alertFn);
        return path;
    };

    // Convert a path in snap.svg format to Clipper format. May return multiple
    // paths. Only supports linear paths. Calls alertFn with an error message
    // and returns null if there's a problem.
    jscut.priv.path.getClipperPathsFromSnapPath = function (path, pxPerInch, alertFn) {
        function getClipperPointFromSnapPoint(x, y) {
            return {
                X: Math.round(x * jscut.priv.path.inchToClipperScale / pxPerInch),
                Y: Math.round(y * jscut.priv.path.inchToClipperScale / pxPerInch)
            };
        };

        if (path.length < 2 || path[0].length != 3 || path[0][0] != 'M') {
            alertFn("Path does not begin with M");
            return null;
        }
        var currentPath = [getClipperPointFromSnapPoint(path[0][1], path[0][2])];
        var result = [currentPath];
        for (var i = 1; i < path.length; ++i) {
            var subpath = path[i];
            if (subpath[0] == 'M' && subpath.length == 3) {
                currentPath = [getClipperPointFromSnapPoint(subpath[1], subpath[2])];
                result.push(currentPath);
            } else if (subpath[0] == 'L') {
                for (var j = 0; j < (subpath.length - 1) / 2; ++j)
                    currentPath.push(getClipperPointFromSnapPoint(subpath[1 + j * 2], subpath[2 + j * 2]));
            } else {
                alertFn("Subpath has a non-linear prefix: " + subpath[0]);
                return null;
            }
        }
        return result;
    };

    // Convert a set of Clipper paths to a single snap.svg path.
    jscut.priv.path.getSnapPathFromClipperPaths = function (path, pxPerInch) {
        function pushSnapPointFromClipperPoint(a, p) {
            a.push(p.X * pxPerInch / jscut.priv.path.inchToClipperScale);
            a.push(p.Y * pxPerInch / jscut.priv.path.inchToClipperScale);
        }

        var result = [];
        for (var i = 0; i < path.length; ++i) {
            var p = path[i];
            var m = ['M'];
            pushSnapPointFromClipperPoint(m, p[0]);
            result.push(m);
            var l = ['L'];
            for (var j = 1; j < p.length; ++j)
                pushSnapPointFromClipperPoint(l, p[j]);
            result.push(l);
        }
        return result;
    };

    // Convert Clipper paths to C format. Returns [double** cPaths, int cNumPaths, int* cPathSizes].
    jscut.priv.path.convertPathsToCpp = function(memoryBlocks, paths) {
        var doubleSize = 8;

        var cPaths = Module._malloc(paths.length * 4);
        memoryBlocks.push(cPaths);
        var cPathsBase = cPaths >> 2;

        var cPathSizes = Module._malloc(paths.length * 4);
        memoryBlocks.push(cPathSizes);
        var cPathSizesBase = cPathSizes >> 2;

        for (var i = 0; i < paths.length; ++i) {
            var path = paths[i];

            var cPath = Module._malloc(path.length * 2 * doubleSize + 4);
            memoryBlocks.push(cPath);
            if (cPath & 4)
                cPath += 4;
            //console.log("-> " + cPath.toString(16));
            var pathArray = new Float64Array(Module.HEAPU32.buffer, Module.HEAPU32.byteOffset + cPath);

            for (var j = 0; j < path.length; ++j) {
                var point = path[j];
                pathArray[j * 2] = point.X;
                pathArray[j * 2 + 1] = point.Y;
            }

            Module.HEAPU32[cPathsBase + i] = cPath;
            Module.HEAPU32[cPathSizesBase + i] = path.length;
        }

        return [cPaths, paths.length, cPathSizes];
    }

    // Convert C format paths to Clipper paths. double**& cPathsRef, int& cNumPathsRef, int*& cPathSizesRef
    // This version assume each point has X, Y (stride = 2).
    jscut.priv.path.convertPathsFromCpp = function (memoryBlocks, cPathsRef, cNumPathsRef, cPathSizesRef) {
        var cPaths = Module.HEAPU32[cPathsRef >> 2];
        memoryBlocks.push(cPaths);
        var cPathsBase = cPaths >> 2;

        var cNumPaths = Module.HEAPU32[cNumPathsRef >> 2];

        var cPathSizes = Module.HEAPU32[cPathSizesRef >> 2];
        memoryBlocks.push(cPathSizes);
        var cPathSizesBase = cPathSizes >> 2;

        var convertedPaths = [];
        for (var i = 0; i < cNumPaths; ++i) {
            var pathSize = Module.HEAPU32[cPathSizesBase + i];
            var cPath = Module.HEAPU32[cPathsBase + i];
            // cPath contains value to pass to Module._free(). The aligned version contains the actual data.
            memoryBlocks.push(cPath);
            if (cPath & 4)
                cPath += 4;
            var pathArray = new Float64Array(Module.HEAPU32.buffer, Module.HEAPU32.byteOffset + cPath);

            var convertedPath = [];
            convertedPaths.push(convertedPath);
            for (var j = 0; j < pathSize; ++j)
                convertedPath.push({
                    X: pathArray[j * 2],
                    Y: pathArray[j * 2 + 1]
                });
        }

        return convertedPaths;
    }

    // Convert C format paths to array of CamPath. double**& cPathsRef, int& cNumPathsRef, int*& cPathSizesRef
    // This version assume each point has X, Y, Z (stride = 3).
    jscut.priv.path.convertPathsFromCppToCamPath = function (memoryBlocks, cPathsRef, cNumPathsRef, cPathSizesRef) {
        var cPaths = Module.HEAPU32[cPathsRef >> 2];
        memoryBlocks.push(cPaths);
        var cPathsBase = cPaths >> 2;

        var cNumPaths = Module.HEAPU32[cNumPathsRef >> 2];

        var cPathSizes = Module.HEAPU32[cPathSizesRef >> 2];
        memoryBlocks.push(cPathSizes);
        var cPathSizesBase = cPathSizes >> 2;

        var convertedPaths = [];
        for (var i = 0; i < cNumPaths; ++i) {
            var pathSize = Module.HEAPU32[cPathSizesBase + i];
            var cPath = Module.HEAPU32[cPathsBase + i];
            // cPath contains value to pass to Module._free(). The aligned version contains the actual data.
            memoryBlocks.push(cPath);
            if (cPath & 4)
                cPath += 4;
            var pathArray = new Float64Array(Module.HEAPU32.buffer, Module.HEAPU32.byteOffset + cPath);

            var convertedPath = [];
            convertedPaths.push({ path: convertedPath, safeToClose: false });
            for (var j = 0; j < pathSize; ++j)
                convertedPath.push({
                    X: pathArray[j * 3],
                    Y: pathArray[j * 3 + 1],
                    Z: pathArray[j * 3 + 2],
                });
        }

        return convertedPaths;
    }

    // Simplify and clean up Clipper geometry. fillRule is ClipperLib.PolyFillType.
    jscut.priv.path.simplifyAndClean = function (geometry, fillRule) {
        geometry = ClipperLib.Clipper.CleanPolygons(geometry, jscut.priv.path.cleanPolyDist);
        geometry = ClipperLib.Clipper.SimplifyPolygons(geometry, fillRule);
        return geometry;
    }

    // Clip Clipper geometry. clipType is a ClipperLib.ClipType constant. Returns new geometry.
    jscut.priv.path.clip = function (paths1, paths2, clipType) {
        var clipper = new ClipperLib.Clipper();
        clipper.AddPaths(paths1, ClipperLib.PolyType.ptSubject, true);
        clipper.AddPaths(paths2, ClipperLib.PolyType.ptClip, true);
        var result = [];
        clipper.Execute(clipType, result, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);
        return result;
    }

    // Return difference between to Clipper geometries. Returns new geometry.
    jscut.priv.path.diff = function (paths1, paths2) {
        return jscut.priv.path.clip(paths1, paths2, ClipperLib.ClipType.ctDifference);
    }

    // Offset Clipper geometries by amount (positive expands, negative shrinks). Returns new geometry.
    jscut.priv.path.offset = function (paths, amount, joinType, endType) {
        if (typeof joinType == 'undefined')
            joinType = ClipperLib.JoinType.jtRound;
        if (typeof endType == 'undefined')
            endType = ClipperLib.EndType.etClosedPolygon;

        // bug workaround: join types are swapped in ClipperLib 6.1.3.2
        if (joinType == ClipperLib.JoinType.jtSquare)
            joinType = ClipperLib.JoinType.jtMiter;
        else if (joinType == ClipperLib.JoinType.jtMiter)
            joinType = ClipperLib.JoinType.jtSquare;

        var co = new ClipperLib.ClipperOffset(2, jscut.priv.path.arcTolerance);
        co.AddPaths(paths, joinType, endType);
        var offsetted = [];
        co.Execute(offsetted, amount);
        //offsetted = ClipperLib.Clipper.CleanPolygons(offsetted, jscut.priv.path.cleanPolyDist);
        return offsetted;
    }
})();
