// Copyright 2014 Todd Fleming

var Cam = new function () {
    function offset(paths, amount) {
        var co = new ClipperLib.ClipperOffset(2, Path.arcTolerance);
        co.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
        var offsetted = [];
        co.Execute(offsetted, amount);
        offsetted = ClipperLib.Clipper.CleanPolygons(offsetted, Path.cleanPolyDist);
        return offsetted;
    }

    // Try to merge paths. A merged path doesn't cross outside of bounds.
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

            // TODO: check crossing
            path = paths[closestPathIndex];
            paths[closestPathIndex] = [];
            numLeft -= 1;
            path = path.slice(closestPointIndex, path.length).concat(path.slice(0, closestPointIndex));
            path.push(path[0]);
            currentPath = currentPath.concat(path);
            currentPoint = currentPath[currentPath.length - 1];
        }
        mergedPaths.push(currentPath);
        return mergedPaths;
    }

    // cutterDia is in Clipper units. overlap is in the range [0, 1).
    this.pocket = function (geometry, cutterDia, overlap) {
        geometry = ClipperLib.Clipper.CleanPolygons(geometry, Path.cleanPolyDist);
        geometry = ClipperLib.Clipper.SimplifyPolygons(geometry, ClipperLib.PolyFillType.pftEvenOdd);
        var current = offset(geometry, -cutterDia / 2);
        var bounds = current.slice(0);
        var allPaths = [];
        while (true) {
            if (current.length == 0)
                break;
            allPaths = current.concat(allPaths);
            current = offset(current, -cutterDia * (1 - overlap));
        }
        return mergePaths(bounds, allPaths);
    };
};
