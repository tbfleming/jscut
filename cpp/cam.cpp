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
#include <chrono>
#include <cmath>

using namespace std;
using namespace ClipperLib;

static const long long inchToClipperScale = 100000;
//static const long long cleanPolyDist = inchToClipperScale / 100000;
static const long long arcTolerance = inchToClipperScale / 10000;

struct CandidatePath {
    Path path;
    double distToCurrentPos;
};

static Paths clip(const Paths& paths1, const Paths& paths2, ClipType clipType)
{
    Clipper clipper;
    clipper.AddPaths(paths1, ptSubject, true);
    clipper.AddPaths(paths2, ptClip, true);
    Paths result;
    clipper.Execute(clipType, result);
    return result;
}

static Paths offset(const Path& path, long long delta, JoinType joinType = jtRound, EndType endType = etClosedPolygon)
{
    ClipperOffset co(2, arcTolerance);
    co.AddPath(path, joinType, endType);
    Paths result;
    co.Execute(result, delta);
    //CleanPolygons(result, cleanPolyDist);
    return result;
}

static Paths offset(const Paths& paths, long long delta, JoinType joinType = jtRound, EndType endType = etClosedPolygon)
{
    ClipperOffset co(2, arcTolerance);
    co.AddPaths(paths, joinType, endType);
    Paths result;
    co.Execute(result, delta);
    //CleanPolygons(result, cleanPolyDist);
    return result;
}

static double dist(double x1, double y1, double x2, double y2) {
    return sqrt((x1-x2)*(x1-x2) + (y1-y2)*(y1-y2));
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
        long long minProgress = llround(stepover / 8);
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
            {
                convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, {});
                return;
            }
        };

        //convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, {spiral});

        Paths cutterPaths{spiral};
        long long currentX, currentY;

        auto updateCurrentPos = [&]() {
            auto& lastPath = cutterPaths.back();
            auto& lastPos = lastPath.back();
            currentX = lastPos.X;
            currentY = lastPos.Y;
        };
        updateCurrentPos();

        auto cutArea = offset(cutterPaths, cutterDia / 2, jtRound, etOpenRound);

        //cutArea = cutArea.concat(cutterPaths);
        //var camPaths = [];
        //for (var i = 0; i < cutArea.length; ++i)
        //    camPaths.push({ path: cutArea[i], safeToClose: false });
        //return camPaths;

        //var loopStartTime = Date.now();
        auto loopStartTime = std::chrono::high_resolution_clock::now();

        int yyy = 200;
        int xxx = 0;
        while (true) {
            printf("%d\n", xxx);
            //if (++xxx >= yyy)
            //    break;
            auto front = offset(cutArea, -cutterDia / 2 + stepover);
            //auto back = offset(cutArea, -cutterDia / 2 + minProgress);
            auto back = offset(front, minProgress - stepover);
            auto q = clip(front, safeArea, ctIntersection);
            q = offset(q, -minRadius);
            q = offset(q, minRadius);
            for (auto& path: q)
                path.push_back(path.front());

            Clipper clipper;
            clipper.AddPaths(q, ptSubject, false);
            clipper.AddPaths(back, ptClip, true);
            PolyTree result;
            clipper.Execute(ctDifference, result, pftEvenOdd, pftEvenOdd);

            vector<CandidatePath> candidates;
            for (auto child: result.Childs) {
                auto& path = child->Contour;
                double d = dist(path.back().X, path.back().Y, currentX, currentY);
                candidates.push_back({move(path), d});
            }
            make_heap(candidates.begin(), candidates.end(), [](CandidatePath& a, CandidatePath& b){return a.distToCurrentPos > b.distToCurrentPos; });

            bool found = false;
            while (!found && !candidates.empty()) {
                auto& newCutterPath = candidates.front().path;
                reverse(newCutterPath.begin(), newCutterPath.end());
                CleanPolygon(newCutterPath, precision);
                auto newCutArea = offset(newCutterPath, cutterDia / 2, jtRound, etOpenRound);
                if (!clip(newCutArea, cutArea, ctDifference).empty()) {
                    cutterPaths.push_back(move(newCutterPath));
                    cutArea = clip(cutArea, newCutArea, ctUnion);
                    updateCurrentPos();
                    found = true;
                }
                else
                    pop_heap(candidates.begin(), candidates.end(), [](CandidatePath& a, CandidatePath& b){return a.distToCurrentPos > b.distToCurrentPos; });
            }

            if (!found)
                break;


            if (++xxx >= yyy) {
                //cutterPaths = cutArea.concat(newCutArea);
                break;
            }
            
        }

        //console.log("hspocket loop: " + (Date.now() - loopStartTime));
        printf("hspocket loop: %d\n", (int)std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::high_resolution_clock::now() - loopStartTime).count());

        convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, cutterPaths);
    }
    catch (exception& e) {
        printf("%s\n", e.what());
    }
    catch (...) {
        printf("???? unknown exception\n");
    }
};
