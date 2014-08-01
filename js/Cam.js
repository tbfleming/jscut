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
jscut.priv.cam = jscut.priv.cam || {};

(function () {
    "use strict";

    // Does the line from p1 to p2 cross outside of bounds?
    function crosses(bounds, p1, p2) {
        if (bounds == null)
            return true;
        if (p1.X == p2.X && p1.Y == p2.Y)
            return false;
        var clipper = new ClipperLib.Clipper();
        clipper.AddPath([p1, p2], ClipperLib.PolyType.ptSubject, false);
        clipper.AddPaths(bounds, ClipperLib.PolyType.ptClip, true);
        var result = new ClipperLib.PolyTree();
        clipper.Execute(ClipperLib.ClipType.ctIntersection, result, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);
        if (result.ChildCount() == 1) {
            var child = result.Childs()[0];
            var points = child.Contour();
            if (points.length == 2) {
                if (points[0].X == p1.X && points[1].X == p2.X && points[0].Y == p1.Y && points[1].Y == p2.Y)
                    return false;
                if (points[0].X == p2.X && points[1].X == p1.X && points[0].Y == p2.Y && points[1].Y == p1.Y)
                    return false;
            }
        }
        return true;
    }

    // CamPath has this format: {
    //      path:               Clipper path
    //      safeToClose:        Is it safe to close the path without retracting?
    // }

    // Try to merge paths. A merged path doesn't cross outside of bounds. Returns array of CamPath.
    function mergePaths(bounds, paths) {
        if (paths.length == 0)
            return null;

        var currentPath = paths[0];
        currentPath.push(currentPath[0]);
        var currentPoint = currentPath[currentPath.length - 1];
        paths[0] = [];

        var mergedPaths = [];
        var numLeft = paths.length - 1;
        while (numLeft > 0) {
            var closestPathIndex = null;
            var closestPointIndex = null;
            var closestPointDist = null;
            for (var pathIndex = 0; pathIndex < paths.length; ++pathIndex) {
                path = paths[pathIndex];
                for (var pointIndex = 0; pointIndex < path.length; ++pointIndex) {
                    var point = path[pointIndex];
                    var dist = (currentPoint.X - point.X) * (currentPoint.X - point.X) + (currentPoint.Y - point.Y) * (currentPoint.Y - point.Y);
                    if (closestPointDist == null || dist < closestPointDist) {
                        closestPathIndex = pathIndex;
                        closestPointIndex = pointIndex;
                        closestPointDist = dist;
                    }
                }
            }

            path = paths[closestPathIndex];
            paths[closestPathIndex] = [];
            numLeft -= 1;
            var needNew = crosses(bounds, currentPoint, path[closestPointIndex]);
            path = path.slice(closestPointIndex, path.length).concat(path.slice(0, closestPointIndex));
            path.push(path[0]);
            if (needNew) {
                mergedPaths.push(currentPath);
                currentPath = path;
                currentPoint = currentPath[currentPath.length - 1];
            }
            else {
                currentPath = currentPath.concat(path);
                currentPoint = currentPath[currentPath.length - 1];
            }
        }
        mergedPaths.push(currentPath);

        var camPaths = [];
        for (var i = 0; i < mergedPaths.length; ++i) {
            var path = mergedPaths[i];
            camPaths.push({
                path: path,
                safeToClose: !crosses(bounds, path[0], path[path.length - 1])
            });
        }

        return camPaths;
    }

    // Compute paths for pocket operation on Clipper geometry. Returns array
    // of CamPath. cutterDia is in Clipper units. overlap is in the range [0, 1).
    jscut.priv.cam.pocket = function (geometry, cutterDia, overlap, climb) {
        var current = jscut.priv.path.offset(geometry, -cutterDia / 2);
        var bounds = current.slice(0);
        var allPaths = [];
        while (current.length != 0) {
            if (climb)
                for (var i = 0; i < current.length; ++i)
                    current[i].reverse();
            allPaths = current.concat(allPaths);
            current = jscut.priv.path.offset(current, -cutterDia * (1 - overlap));
        }
        return mergePaths(bounds, allPaths);
    };

    // Compute paths for outline operation on Clipper geometry. Returns array
    // of CamPath. cutterDia and width are in Clipper units. overlap is in the 
    // range [0, 1).
    jscut.priv.cam.outline = function (geometry, cutterDia, isInside, width, overlap, climb) {
        var currentWidth = cutterDia;
        var allPaths = [];
        var eachWidth = cutterDia * (1 - overlap);

        var current;
        var bounds;
        var eachOffset;
        var needReverse;

        if (isInside) {
            current = jscut.priv.path.offset(geometry, -cutterDia / 2);
            bounds = jscut.priv.path.diff(current, jscut.priv.path.offset(geometry, -(width - cutterDia / 2)));
            eachOffset = -eachWidth;
            needReverse = climb;
        } else {
            current = jscut.priv.path.offset(geometry, cutterDia / 2);
            bounds = jscut.priv.path.diff(jscut.priv.path.offset(geometry, width - cutterDia / 2), current);
            eachOffset = eachWidth;
            needReverse = !climb;
        }

        while (currentWidth <= width) {
            if (needReverse)
                for (var i = 0; i < current.length; ++i)
                    current[i].reverse();
            allPaths = current.concat(allPaths);
            var nextWidth = currentWidth + eachWidth;
            if (nextWidth > width && width - currentWidth > 0) {
                current = jscut.priv.path.offset(current, width - currentWidth);
                if (needReverse)
                    for (var i = 0; i < current.length; ++i)
                        current[i].reverse();
                allPaths = current.concat(allPaths);
                break;
            }
            currentWidth = nextWidth;
            current = jscut.priv.path.offset(current, eachOffset);
        }
        return mergePaths(bounds, allPaths);
    };

    // Compute paths for engrave operation on Clipper geometry. Returns array
    // of CamPath.
    jscut.priv.cam.engrave = function (geometry, climb) {
        var allPaths = [];
        for (var i = 0; i < geometry.length; ++i) {
            var path = geometry[i].slice(0);
            if (!climb)
                path.reverse();
            path.push(path[0]);
            allPaths.push(path);
        }
        var result = mergePaths(null, allPaths);
        for (var i = 0; i < result.length; ++i)
            result[i].safeToClose = true;
        return result;
    };

    // Convert array of CamPath to array of Clipper path
    jscut.priv.cam.getClipperPathsFromCamPaths = function (paths) {
        var result = [];
        if (paths != null)
            for (var i = 0; i < paths.length; ++i)
                result.push(paths[i].path);
        return result;
    }

    // Convert paths to gcode. getGcode() assumes that the current Z position is at safeZ.
    // getGcode()'s gcode returns Z to this position at the end.
    // namedArgs must have:
    //      paths:          Array of CamPath
    //      ramp:           Ramp these paths?
    //      scale:          Factor to convert Clipper units to gcode units
    //      offsetX:        Offset X (gcode units)
    //      offsetY:        Offset Y (gcode units)
    //      decimal:        Number of decimal places to keep in gcode
    //      topZ:           Top of area to cut (gcode units)
    //      botZ:           Bottom of area to cut (gcode units)
    //      safeZ:          Z position to safely move over uncut areas (gcode units)
    //      passDepth:      Cut depth for each pass (gcode units)
    //      plungeFeed:     Feedrate to plunge cutter (gcode units)
    //      retractFeed:    Feedrate to retract cutter (gcode units)
    //      cutFeed:        Feedrate for horizontal cuts (gcode units)
    //      rapidFeed:      Feedrate for rapid moves (gcode units)
    jscut.priv.cam.getGcode = function (namedArgs) {
        var paths = namedArgs.paths;
        var ramp = namedArgs.ramp;
        var scale = namedArgs.scale;
        var offsetX = namedArgs.offsetX;
        var offsetY = namedArgs.offsetY;
        var decimal = namedArgs.decimal;
        var topZ = namedArgs.topZ;
        var botZ = namedArgs.botZ;
        var safeZ = namedArgs.safeZ;
        var passDepth = namedArgs.passDepth;
        var plungeFeedGcode = ' F' + namedArgs.plungeFeed;
        var retractFeedGcode = ' F' + namedArgs.retractFeed;
        var cutFeedGcode = ' F' + namedArgs.cutFeed;
        var rapidFeedGcode = ' F' + namedArgs.rapidFeed;
        var gcode = "";

        var retractGcode =
            '; Retract\r\n' +
            'G1 Z' + safeZ.toFixed(decimal) + rapidFeedGcode + '\r\n';

        function getX(p) {
            return p.X * scale + offsetX;
        }

        function getY(p) {
            return -p.Y * scale + offsetY;
        }

        function dist(x1, y1, x2, y2) {
            return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
        }

        function convertPoint(p) {
            return " X" + (p.X * scale + offsetX).toFixed(decimal) + ' Y' + (-p.Y * scale + offsetY).toFixed(decimal);
        }

        for (var pathIndex = 0; pathIndex < paths.length; ++pathIndex) {
            var path = paths[pathIndex];
            if (path.path.length == 0)
                continue;
            gcode +=
                '\r\n' +
                '; Path ' + pathIndex + '\r\n';
            var currentZ = topZ;
            while (currentZ > botZ) {
                if (currentZ != topZ && !path.safeToClose)
                    gcode += retractGcode;
                gcode +=
                    '; Rapid to initial position\r\n' +
                    'G1' + convertPoint(path.path[0]) + rapidFeedGcode + '\r\n' +
                    'G1 Z' + currentZ.toFixed(decimal) + '\r\n';
                var nextZ = Math.max(currentZ - passDepth, botZ);

                var executedRamp = false;
                if (ramp) {
                    var minPlungeTime = (currentZ - nextZ) / namedArgs.plungeFeed;
                    var idealDist = namedArgs.cutFeed * minPlungeTime;
                    var end;
                    var totalDist = 0;
                    for (end = 1; end < path.path.length; ++end) {
                        if (totalDist > idealDist)
                            break;
                        totalDist += 2 * dist(getX(path.path[end - 1]), getY(path.path[end - 1]), getX(path.path[end]), getY(path.path[end]));
                    }
                    if (totalDist > 0) {
                        gcode += '; ramp\r\n'
                        executedRamp = true;
                        var rampPath = path.path.slice(0, end).concat(path.path.slice(0, end - 1).reverse());
                        var distTravelled = 0;
                        for (var i = 1; i < rampPath.length; ++i) {
                            distTravelled += dist(getX(rampPath[i - 1]), getY(rampPath[i - 1]), getX(rampPath[i]), getY(rampPath[i]));
                            var newZ = currentZ + distTravelled / totalDist * (nextZ - currentZ);
                            gcode += 'G1' + convertPoint(rampPath[i]) + ' Z' + newZ.toFixed(decimal);
                            if (i == 1)
                                gcode += ' F' + Math.min(totalDist / minPlungeTime, namedArgs.cutFeed).toFixed(decimal) + '\r\n';
                            else
                                gcode += '\r\n';
                        }
                    }
                }

                if (!executedRamp)
                    gcode +=
                        '; plunge\r\n' +
                        'G1 Z' + nextZ.toFixed(decimal) + plungeFeedGcode + '\r\n';

                currentZ = nextZ;
                gcode += '; cut\r\n';

                for (var i = 1; i < path.path.length; ++i) {
                    gcode += 'G1' + convertPoint(path.path[i]);
                    if (i == 1)
                        gcode += cutFeedGcode + '\r\n';
                    else
                        gcode += '\r\n';
                }
            }
            gcode += retractGcode;
        }

        return gcode;
    };
})();
