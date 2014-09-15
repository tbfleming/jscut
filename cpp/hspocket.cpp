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

#include "cam.h"
#include "offset.h"

using namespace cam;
using namespace FlexScan;
using namespace boost::polygon::operators;
using namespace std;

static const long long spiralArcTolerance = inchToClipperScale / 1000;

template<typename Derived>
struct SpiralEdge {
    bool isGeometry = false;
    size_t index;
};

struct CandidatePath {
    Polygon path;
    double distToCurrentPos;
};

Polygon createSpiral(int stepover, int startX, int startY, double spiralR) {
    Polygon spiral;
    auto spiralStartTime = std::chrono::high_resolution_clock::now();
    double angle = 0;
    while (true) {
        double r = angle / M_PI / 2 * stepover;
        spiral.push_back({lround(r * cos(-angle) + startX), lround(r * sin(-angle) + startY)});
        double deltaAngle = deltaAngleForError(spiralArcTolerance, max(r, (double)spiralArcTolerance));
        angle += deltaAngle;
        if (r >= spiralR)
            break;
    }
    printf("spiral: %d\n", (int)std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::high_resolution_clock::now() - spiralStartTime).count());
    return spiral;
}

void trimSpiral(Polygon& spiral, const PolygonSet& safeArea) {
    auto spiralTrimStartTime = std::chrono::high_resolution_clock::now();

    using Edge = Edge<Point, SpiralEdge>;
    using ScanlineEdge = ScanlineEdge<Edge, ScanlineEdgeWindingNumber>;
    using Scan = Scan<ScanlineEdge>;

    vector<Edge> edges;
    Scan::insertPolygons(edges, safeArea.begin(), safeArea.end(), true);
    for (auto& edge: edges)
        edge.isGeometry = true;
    auto spiralBegin = edges.size();
    Scan::insertPoints(edges, spiral, false, true);
    for (size_t i = 0; i < spiral.size(); ++i)
        edges[spiralBegin + i].index = i;

    Scan::intersectEdges(edges, edges.begin(), edges.end());
    Scan::sortEdges(edges.begin(), edges.end());

    size_t endIndex = spiral.size();
    Scan::scan(
        edges.begin(), edges.end(),
        makeAccumulateWindingNumber([](ScanlineEdge& e){return e.edge->isGeometry; }),
        [&endIndex](int x, double y, vector<ScanlineEdge>::iterator begin, vector<ScanlineEdge>::iterator end)
    {
        while (begin != end) {
            bool isInGeometry = begin->windingNumberBefore && begin->windingNumberAfter;
            if (!begin->edge->isGeometry && !isInGeometry && begin->edge->index < endIndex)
                endIndex = begin->edge->index;
            ++begin;
        }
    });

    spiral.erase(spiral.begin() + endIndex, spiral.end());

    printf("spiral trim time: %d\n", (int)std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::high_resolution_clock::now() - spiralTrimStartTime).count());
}

extern "C" void hspocket(
    double** paths, int numPaths, int* pathSizes, double cutterDia,
    double**& resultPaths, int& resultNumPaths, int*& resultPathSizes
    )
{
    try {
        PolygonSet geometry = convertPathsFromC(paths, numPaths, pathSizes);

        int startX = lround(67 / 25.4 * inchToClipperScale);
        int startY = lround(72 / 25.4 * inchToClipperScale);
        int stepover = cutterDia / 4;
        double spiralR = 60 / 25.4 * inchToClipperScale;
        //int minRadius = cutterDia / 2;
        int minRadius = cutterDia / 8;
        int minProgress = lround(stepover / 8);
        int precision = lround(inchToClipperScale / 5000);

        PolygonSet safeArea = offset(geometry, -cutterDia / 2, arcTolerance, true);
        //convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, safeArea, true);
        //return;

        Polygon spiral = createSpiral(stepover, startX, startY, spiralR);
        trimSpiral(spiral, safeArea);
        //convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, {spiral}, true);
        //return;

        PolygonSet cutterPaths;
        cutterPaths.push_back(move(spiral));
        PolygonSet cutArea = offset(cutterPaths, cutterDia / 2, arcTolerance, false);

        //convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, cutArea, true);
        //return;

        int currentX, currentY;
        auto updateCurrentPos = [&]() {
            auto& lastPath = cutterPaths.back();
            auto& lastPos = lastPath.back();
            currentX = x(lastPos);
            currentY = y(lastPos);
        };
        updateCurrentPos();

        auto loopStartTime = std::chrono::high_resolution_clock::now();

        int yyy = 2;
        int xxx = 0;
        while (true) {
            printf("%d\n", xxx);
            ++xxx;
            //if (xxx >= yyy)
            //    break;
            printf("* a\n");
            auto front = offset(cutArea, -cutterDia / 2 + stepover, arcTolerance, true);
            printf("* b\n");
            //auto back = offset(cutArea, -cutterDia / 2 + minProgress);
            auto back = offset(front, minProgress - stepover, arcTolerance, true);

            printf("* c\n");
            PolygonSet q = getPolygonSetFromEdges<PolygonSet>(combinePolygonSet<FlexScan::Edge<Point, EdgeId, EdgeNext>>(
                front, safeArea, true, true,
                makeCombinePolygonSetCondition([](int w1, int w2){return w1 > 0 && w2 > 0; }),
                SetNext{}));
            printf("* d\n");
            q = offset(q, -minRadius, arcTolerance, true);
            printf("* e\n");
            q = offset(q, minRadius, arcTolerance, true);
            if (q.empty())
                break;

            //convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, q, true);
            //return;

            printf("* f\n");
            PolygonSet paths = getOpenPolygonSetFromEdges<PolygonSet>(combinePolygonSet<FlexScan::Edge<Point, EdgeId, EdgeNext, EdgePrev>>(
                q, back, true, true,
                OpenMinusClosedCondition{},
                SetNextAndPrev{}));

            //convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, paths, true);
            //return;

            //if (xxx >= yyy)
            //    break;

            printf("* g\n");
            vector<CandidatePath> candidates;
            for (auto& path: paths) {
                double d = pointDistance(path.back(), Point{currentX, currentY});
                candidates.push_back({move(path), d});
            }
            printf("* h\n");
            make_heap(candidates.begin(), candidates.end(), [](CandidatePath& a, CandidatePath& b){return a.distToCurrentPos > b.distToCurrentPos; });

            printf("* i\n");
            bool found = false;
            while (!found && !candidates.empty()) {
                auto& newCutterPath = candidates.front().path;
                printf("* i1\n");
                reverse(newCutterPath.begin(), newCutterPath.end());
                printf("* i2\n");
                auto newCutArea = offsetPolygon<PolygonSet>(newCutterPath, cutterDia / 2, arcTolerance, newCutterPath.front() == newCutterPath.back());
                //if (!clip(newCutArea, cutArea, ctDifference).empty()) {

                    //if (xxx >= yyy) {
                    //    cutterPaths.clear();
                    //    //cutterPaths.push_back(move(newCutterPath));
                    //    cutterPaths.push_back(move(ccc));
                    //    convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, cutterPaths);
                    //    return;
                    //}





                //convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, cutArea, true);
                //return;


                //convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, newCutArea, true);
                //return;

                printf("* i3\n");
                    cutterPaths.push_back(move(newCutterPath));
                    cutArea = getPolygonSetFromEdges<PolygonSet>(combinePolygonSet<FlexScan::Edge<Point, EdgeId, EdgeNext>>(
                        cutArea, newCutArea, true, true,
                        makeCombinePolygonSetCondition([](int w1, int w2){return w1 > 0 || w2 > 0; }),
                        SetNext{}));

                    //convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, cutArea, true);
                    //return;

                    //printf("Here!\n");
                    //break;

                    printf("* i4\n");
                    updateCurrentPos();
                    found = true;
                //}
                //else {
                //    pop_heap(candidates.begin(), candidates.end(), [](CandidatePath& a, CandidatePath& b){return a.distToCurrentPos > b.distToCurrentPos; });
                //    candidates.pop_back();
                //}
            }

            printf("* end i\n");

            if (!found)
                break;

            if (xxx >= yyy) {
                //cutterPaths = cutArea.concat(newCutArea);
                break;
            }
        }

        //console.log("hspocket loop: " + (Date.now() - loopStartTime));
        printf("hspocket loop: %d\n", (int)std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::high_resolution_clock::now() - loopStartTime).count());

        convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, cutterPaths, true);
    }
    catch (exception& e) {
        printf("%s\n", e.what());
    }
    catch (...) {
        printf("???? unknown exception\n");
    }
};
