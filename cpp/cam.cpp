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

#define _USE_MATH_DEFINES

#include "clipper.hpp"
#include <algorithm>
#include <cmath>

using namespace std;
using namespace ClipperLib;

static const long long inchToClipperScale = 100000;
static const long long arcTolerance = inchToClipperScale / 40000;

static Paths offset(const Paths& paths, long long delta, JoinType joinType = jtRound, EndType endType = etClosedPolygon)
{
    ClipperOffset co(2, arcTolerance);
    co.AddPaths(paths, joinType, endType);
    Paths result;
    co.Execute(result, delta);
    //offsetted = ClipperLib.Clipper.CleanPolygons(offsetted, jscut.priv.path.cleanPolyDist);
    return result;
}

// Convert paths to C format
static void convertPathsToC(
    double**& cPaths, int& cNumPaths, int*& cPathSizes,
    const Paths& paths
    )
{
    cPaths = (double**)malloc(paths.size() * sizeof(double*));
    cNumPaths = paths.size();
    cPathSizes = (int*)malloc(paths.size() * sizeof(int));
    for (int i = 0; i < paths.size(); ++i) {
        const Path& path = paths[i];
        cPathSizes[i] = path.size();
        //printf("path size: %d\n", cPathSizes[i]);
        char* pathStorage = (char*)malloc(path.size() * 2 * sizeof(double) + sizeof(double) / 2);
        //printf("path storage: %p\n", pathStorage);
        // cPaths[i] contains the unaligned block so the javascript side can free it properly.
        cPaths[i] = (double*)pathStorage;
        if ((int)pathStorage & 4)
            pathStorage += 4;
        double* p = (double*)pathStorage;
        for (int j = 0; j < path.size(); ++j) {
            p[j*2] = path[j].X;
            p[j*2+1] = path[j].Y;
        }
    }
}

extern "C" void hspocket(
    double** paths, int numPaths, int* pathSizes, double cutterDia,
    double**& resultPaths, int& resultNumPaths, int*& resultPathSizes
    ) 
{
    try {
        Paths geometry;
        for (int i = 0; i < numPaths; ++i) {
            geometry.push_back(vector<IntPoint>{});
            auto& newPath = geometry.back();
            double* p = paths[i];
            int l = pathSizes[i];
            for (int j = 0; j < l; ++j)
                newPath.push_back({llround(p[j*2]), llround(p[j*2+1])});
        }

        long long startX = llround(67 / 25.4 * inchToClipperScale);
        long long startY = llround(72 / 25.4 * inchToClipperScale);
        long long stepover = cutterDia / 4;
        double spiralR = 60 / 25.4 * inchToClipperScale;
        long long minRadius = cutterDia;
        long long minProgress = llround(stepover / 4);
        long long precision = llround(inchToClipperScale / 5000);

        Paths safeArea = offset(geometry, -cutterDia / 2);

        Path spiral;
        {
            double angle = 0;
            while (true) {
                double r = angle / M_PI / 2 * stepover;
                spiral.push_back({llround(r * cos(-angle) + startX), llround(r * sin(-angle) + startY)});
                angle += M_PI * 2 / 100;
                if (r >= spiralR)
                    break;
            }

            Clipper clipper;
            clipper.AddPath(spiral, ptSubject, false);
            clipper.AddPaths(safeArea, ptClip, true);
            PolyTree result;
            clipper.Execute(ctIntersection, result, pftEvenOdd, pftEvenOdd);

            bool found = false;
            for (auto& child: result.Childs) {
                if (found)
                    break;
                for (auto& point: child->Contour) {
                    if (point.X == startX && point.Y == startY) {
                        reverse(child->Contour.begin(), child->Contour.end());
                        spiral = move(child->Contour);
                        found = true;
                        break;
                    }
                }
            }

            if (!found)
                spiral.clear();
        };

        Paths xxxx{spiral};
        convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, xxxx);
    }
    catch (exception& e) {
        printf("%s\n", e.what());
    }
    catch (...) {
        printf("???? unknown exception\n");
    }

    /*
    var cutterPath = [spiral];
    var currentX, currentY;

    function updateCurrentPos() {
        var lastPath = cutterPath[cutterPath.length - 1];
        var lastPos = lastPath[lastPath.length - 1];
        currentX = lastPos.X;
        currentY = lastPos.Y;
    }
    updateCurrentPos();

    var cutArea = jscut.priv.path.offset(cutterPath, cutterDia / 2, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound);

    //cutArea = cutArea.concat(cutterPath);
    //var camPaths = [];
    //for (var i = 0; i < cutArea.length; ++i)
    //    camPaths.push({ path: cutArea[i], safeToClose: false });
    //return camPaths;

    var loopStartTime = Date.now();

    var yyy = 100;
    var xxx = 0;
    while (true) {
        console.log(xxx);
        //if (++xxx >= yyy)
        //    break;
        var front = jscut.priv.path.offset(cutArea, -cutterDia / 2 + stepover);
        var back = jscut.priv.path.offset(front, minProgress - stepover);
        var q = jscut.priv.path.clip(front, safeArea, ctIntersection);
        q = jscut.priv.path.offset(q, -minRadius);
        q = jscut.priv.path.offset(q, minRadius);
        for (var i = 0; i < q.length; ++i)
            q[i].push(q[i][0]);

        var clipper = new ClipperLib.Clipper();
        clipper.AddPaths(q, ptSubject, false);
        clipper.AddPaths(back, ptClip, true);
        var result = new ClipperLib.PolyTree();
        clipper.Execute(ctDifference, result, pftEvenOdd, pftEvenOdd);
        var childs = result.Childs();

        var closestPath = [];
        var closestDist = 0;
        for (var i = 0; i < childs.length; ++i) {
            var path = childs[i].Contour();
            var d = dist(path[0].X, path[0].Y, currentX, currentY);
            if (closestPath.length == 0 || d < closestDist) {
                path.reverse();
                var pathCutArea = jscut.priv.path.offset([path], cutterDia / 2, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound);
                pathCutArea = jscut.priv.path.clip(pathCutArea, cutArea, ctDifference);
                if (pathCutArea.length > 0) {
                    closestPath = path;
                    closestDist = d;
                }
            }
        }

        if (closestPath.length == 0)
            break;

        var newCutterPath = [closestPath];
        newCutterPath = ClipperLib.Clipper.CleanPolygons(newCutterPath, precision);
        cutterPath.push(closestPath);

        var newCutArea = jscut.priv.path.offset(newCutterPath, cutterDia / 2, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound);
        if (++xxx >= yyy) {
            //cutterPath = cutArea.concat(newCutArea);
            break;
        }
        cutArea = jscut.priv.path.clip(cutArea, newCutArea, ctUnion);
    }

    console.log("hspocket loop: " + (Date.now() - loopStartTime));

    var camPaths = [];
    for (var i = 0; i < cutterPath.length; ++i)
        camPaths.push({ path: cutterPath[i], safeToClose : false });
    return camPaths;
*/
};
