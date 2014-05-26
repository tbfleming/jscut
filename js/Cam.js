// Copyright 2014 Todd Fleming

var Cam = new function () {
    var Cam = this;

    // Does the line from p1 to p2 cross outside of bounds?
    function crosses(bounds, p1, p2) {
        if(p1.X == p2.X && p1.Y == p2.Y)
            return false;
        var clipper = new ClipperLib.Clipper();
        clipper.AddPath([p1, p2], ClipperLib.PolyType.ptSubject, false);
        clipper.AddPaths(bounds, ClipperLib.PolyType.ptClip, true);
        var result = new ClipperLib.PolyTree();
        clipper.Execute(ClipperLib.ClipType.ctIntersection, result, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);
        if (result.ChildCount() == 1) {
            var child = result.Childs()[0];
            points = child.Contour();
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

        currentPath = paths[0];
        currentPath.push(currentPath[0]);
        currentPoint = currentPath[currentPath.length-1];
        paths[0] = [];

        mergedPaths = [];
        var numLeft = paths.length - 1;
        while (numLeft > 0) {
            var closestPathIndex = null;
            var closestPointIndex = null;
            var closestPointDist = null;
            for (var pathIndex = 0; pathIndex < paths.length; ++pathIndex) {
                path = paths[pathIndex];
                for (var pointIndex = 0; pointIndex < path.length; ++pointIndex) {
                    point = path[pointIndex];
                    dist = (currentPoint.X - point.X) * (currentPoint.X - point.X) + (currentPoint.Y - point.Y) * (currentPoint.Y - point.Y);
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

        camPaths = [];
        for(var i = 0; i < mergedPaths.length; ++i) {
            var path = mergedPaths[i];
            camPaths.push({
                path: path,
                safeToClose: !crosses(bounds, path[0], path[path.length-1])});
        }

        return camPaths;
    }

    // Compute paths for pocket operation on Clipper geometry. Returns array
    // of CamPath. cutterDia is in Clipper units. overlap is in the range [0, 1).
    Cam.pocket = function (geometry, cutterDia, overlap) {
        var current = Path.offset(geometry, -cutterDia / 2);
        var bounds = current.slice(0);
        var allPaths = [];
        while (current.length != 0) {
            allPaths = current.concat(allPaths);
            current = Path.offset(current, -cutterDia * (1 - overlap));
        }
        return mergePaths(bounds, allPaths);
    };

    // Compute paths for outline operation on Clipper geometry. Returns array
    // of CamPath. cutterDia and width are in Clipper units. overlap is in the 
    // range [0, 1).
    Cam.outline = function (geometry, cutterDia, width, overlap) {
        var current = Path.offset(geometry, cutterDia / 2);
        var currentWidth = cutterDia;
        var bounds = Path.diff(Path.offset(geometry, width), geometry);
        var allPaths = [];
        var eachOffset = cutterDia * (1 - overlap);
        while (currentWidth <= width) {
            allPaths = current.concat(allPaths);
            var nextWidth = currentWidth + eachOffset;
            if (nextWidth > width && width - currentWidth > 0) {
                current = Path.offset(current, width - currentWidth);
                allPaths = current.concat(allPaths);
                break;
            }
            currentWidth = nextWidth;
            current = Path.offset(current, eachOffset);
        }
        return mergePaths(bounds, allPaths);
    };

    // Convert array of CamPath to array of Clipper path
    Cam.getClipperPathsFromCamPaths = function (paths) {
        result = [];
        for (var i = 0; i < paths.length; ++i)
            result.push(paths[i].path);
        return result;
    }

/*
    // Convert paths to gcode. getGcode() assumes that the current Z position is at safeZ.
    // getGcode()'s gcode returns Z to this position at the end.
    // namedArgs must have:
    //      paths:          Array of CamPath
    //      scale:          Factor to convert Clipper units to gcode units
    //      decimal:        Number of decimal places to keep in gcode
    //      topZ:           Top of area to cut (gcode units)
    //      botZ:           Bottom of area to cut (gcode units)
    //      safeZ:          Z position to safely move over uncut areas (gcode units)
    //      passDepth:      Depth of cut for each pass (gcode units)
    //      plungeFeed:     Feedrate to plunge cutter (gcode units)
    //      retractFeed:    Feedrate to retract cutter (gcode units)
    //      cutFeed:        Feedrate for horizontal cuts (gcode units)
    //      rapidFeed:      Feedrate for rapid moves (gcode units)
    Cam.getGcode = function (namedArgs) {
        var paths = namedArgs.paths;
        var scale = namedArgs.scale;
        var decimal = namedArgs.decimal;
        var topZ = namedArgs.topZ;
        var botZ = namedArgs.botZ;
        var safeZ = namedArgs.safeZ;
        var passDepth = namedArgs.passDepth;
        var plungeFeedGcode = 'F'+namedArgs.plungeFeed;
        var retractFeedGcode = 'F'+namedArgs.retractFeed;
        var cutFeedGcode = 'F'+namedArgs.cutFeed;
        var rapidFeedGcode = 'F'+namedArgs.rapidFeed;
        var gcode = "";

        function convertPoint(p) {
            return "X" + p.X.toFixed(decimal) * scale) + 'Y' + (-p.Y).toFixed(decimal) * scale;
        }

        for (var pathIndex = 0; pathIndex < paths.length; ++pathIndex) {
            var path = paths[pathIndex];
            if (path.length == 0)
                continue;
            gcode +=
                'G1' + convertPoint(path[0]) + rapidFeedGcode + '\n' +
                'G1' + topZ.toFixed(decimal) + '\n';
            var currentZ = 
        }
    };
*/
};
