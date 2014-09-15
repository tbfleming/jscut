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

PolygonSet reduceResolution(const PolygonSet& src) {
    PolygonSet result;
    for (auto& poly: src) {
        //printf("@@@@@@@@@\n");
        if (poly.size() < 2)
            continue;
        result.emplace_back();
        auto& dest = result.back();
        for (size_t i = 0; i < poly.size(); ++i) {
            if (!i || pointDistanceSquared(dest.back(), poly[i]) >= spiralArcTolerance * spiralArcTolerance)
                dest.emplace_back(poly[i]);
            else if (i+1 == poly.size()) {
                if (dest.size() > 1)
                    dest.pop_back();
                dest.emplace_back(poly[i]);
            }
        }
        //printf("%d -> %d\n", poly.size(), dest.size());
    }
    return result;
}

static vector<CandidatePath> getCandidates(double cutterDia, int stepover, int currentX, int currentY, int minProgress, const PolygonSet& safeArea, const PolygonSet& cutArea)
{
    auto front = reduceResolution(offset(cutArea, -cutterDia / 2 + stepover, arcTolerance, OffsetOp::closed));
    //auto back = offset(cutArea, -cutterDia / 2 + minProgress);
    auto back = offset(front, minProgress - stepover, arcTolerance, OffsetOp::closed);

    PolygonSet q = getPolygonSetFromEdges<PolygonSet>(combinePolygonSet<FlexScan::Edge<Point, EdgeId, EdgeNext>>(
        front, safeArea, true, true,
        makeCombinePolygonSetCondition([](int w1, int w2){return w1 > 0 && w2 > 0; }),
        SetNext{}));
    if (q.empty())
        return{};

    PolygonSet paths = reduceResolution(getOpenPolygonSetFromEdges<PolygonSet>(combinePolygonSet<FlexScan::Edge<Point, EdgeId, EdgeNext, EdgePrev>>(
        q, back, true, true,
        OpenMinusClosedCondition{},
        SetNextAndPrev{})));

    vector<CandidatePath> candidates;
    for (auto& path: paths) {
        double d = pointDistance(path.back(), Point{currentX, currentY});
        candidates.push_back({move(path), d});
    }
    make_heap(candidates.begin(), candidates.end(), [](CandidatePath& a, CandidatePath& b){return a.distToCurrentPos > b.distToCurrentPos; });

    return candidates;
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
        int minProgress = lround(stepover / 8);

        PolygonSet safeArea = offset(geometry, -cutterDia / 2, arcTolerance, OffsetOp::closed);

        Polygon spiral = createSpiral(stepover, startX, startY, spiralR);
        trimSpiral(spiral, safeArea);

        PolygonSet cutterPaths;
        cutterPaths.push_back(move(spiral));
        PolygonSet cutArea = offset(cutterPaths, cutterDia / 2, arcTolerance, OffsetOp::open);

        int currentX, currentY;
        auto updateCurrentPos = [&]() {
            auto& lastPath = cutterPaths.back();
            auto& lastPos = lastPath.back();
            currentX = x(lastPos);
            currentY = y(lastPos);
        };
        updateCurrentPos();

        FlexScan::TimeTrack timeTracks[15];
        auto loopStartTime = std::chrono::high_resolution_clock::now();

        int yyy = 39;
        int xxx = 0;
        while (true) {
            ++xxx;
            printf("xxx = %d\n", xxx);

            auto candidates = getCandidates(cutterDia, stepover, currentX, currentY, minProgress, safeArea, cutArea);

            bool found = false;
            while (!found && !candidates.empty()) {
                auto& newCutterPath = candidates.front().path;
                auto newCutArea = offsetPolygon<PolygonSet>(newCutterPath, cutterDia / 2, arcTolerance, newCutterPath.front() == newCutterPath.back() ? OffsetOp::closed : OffsetOp::openRight);

                bool haveSomething = false;
                combinePolygonSet<FlexScan::Edge<Point, EdgeId>>(
                    newCutArea, cutArea, true, true,
                    makeCombinePolygonSetCondition([](int w1, int w2){return w1 > 0 && w2 <= 0; }),
                    SetHaveSomething{haveSomething});
                if (haveSomething) {
                    reverse(newCutterPath.begin(), newCutterPath.end());

                    cutterPaths.push_back(move(newCutterPath));
                    cutArea = getPolygonSetFromEdges<PolygonSet>(combinePolygonSet<FlexScan::Edge<Point, EdgeId, EdgeNext>>(
                        cutArea, newCutArea, true, true,
                        makeCombinePolygonSetCondition([](int w1, int w2){return w1 > 0 || w2 > 0; }),
                        SetNext{}));

                    updateCurrentPos();
                    found = true;
                }
                else {
                    pop_heap(candidates.begin(), candidates.end(), [](CandidatePath& a, CandidatePath& b){return a.distToCurrentPos > b.distToCurrentPos; });
                    candidates.pop_back();
                }
            }


            if (!found) {
                printf("!found xxx=%d\n", xxx);
                break;
            }

            if (xxx >= yyy)
                break;
        }

        for (size_t i = 0; i < sizeof(timeTracks)/sizeof(*timeTracks); ++i)
            printf("time %d: %d\n", i, timeTracks[i].ms());

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
