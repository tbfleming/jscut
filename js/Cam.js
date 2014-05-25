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
        for (var i = 0; i < allPaths.length; ++i)
            allPaths[i].push(allPaths[i][0]);
        return allPaths;
    };
};
