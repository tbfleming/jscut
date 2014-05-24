// Copyright 2014 Todd Fleming

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
            t = 1.0 * i / numSegments;
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
function linearizeSnapPath(path, minNumSegments, minSegmentLength, alertFn) {
    if (path.length < 2 || path[0].length != 3 || path[0][0] != 'M') {
        alertFn("Path does not begin with M")
        return null;
    }
    var x = path[0][1];
    var y = path[0][2];
    var result = [path[0]];
    for (var i = 1; i < path.length; ++i) {
        subpath = path[i];
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
}

// Get a linear path from an element in snap.svg's format. Calls alertFn with an 
// error message and returns null if there's a problem. Returns null without calling
// alertFn if element.type == "svg".
function getLinearSnapPathFromElement(element, minNumSegments, minSegmentLength, alertFn) {
    var path = null;

    if (element.type == "svg")
        return null;
    else if (element.type == "path")
        path = element.attr("d");
    else {
        alertFn(element.type + " is not supported; try Inkscape's <strong>Object to Path</strong> command");
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
    path = linearizeSnapPath(path, minNumSegments, minSegmentLength, alertFn);
    return path;
}
