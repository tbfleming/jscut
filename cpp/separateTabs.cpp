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
using namespace std;

static const long long spiralArcTolerance = inchToClipperScale / 1000;

template<typename Derived>
struct TabsEdge {
    bool isCutPath = false;
    bool isOverTab = false;
    bool taken = false;
    size_t index = 0;
};

struct SetIsOverTab {
    template<typename Unit, typename HighPrecision, typename It>
    void operator()(Unit x, HighPrecision y, It begin, It end) const
    {
        while (begin != end) {
            begin->edge->isOverTab = begin->windingNumberBefore && begin->windingNumberAfter;
            //if (begin->edge->isOverTab)
            //printf("isCutPath=%d isOverTab=%d index=%d windingNumberBefore=%d windingNumberAfter=%d\n", begin->edge->isCutPath, begin->edge->isOverTab, begin->edge->index, begin->windingNumberBefore, begin->windingNumberAfter);
            ++begin;
        }
    }
};

extern "C" void separateTabs(
    double** pathPolygons, int numPaths, int* pathSizes,
    double** tabPolygons, int numTabPolygons, int* tabPolygonSizes,
    int& error,
    double**& resultPaths, int& resultNumPaths, int*& resultPathSizes)
{
    try {
        using Edge = Edge<Point, EdgeNext, TabsEdge>;
        using ScanlineEdge = ScanlineEdge<Edge, ScanlineEdgeWindingNumber>;
        using Scan = Scan<ScanlineEdge>;

        //printf("separateTabs\n");

        PolygonSet paths = convertPathsFromC(pathPolygons, numPaths, pathSizes);
        PolygonSet tabs = convertPathsFromC(tabPolygons, numTabPolygons, tabPolygonSizes);
        error = false;

        if (paths.empty() || tabs.empty()) {
            convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, paths);
            return;
        }

        //for (size_t i = 0; i < paths.size(); ++i)
        //    printf("%d: %d\n", i, paths[i].size());

        std::vector<Edge> edges;
        Scan::insertPolygons(edges, paths.begin(), paths.end(), false);
        for (auto& e: edges)
            e.isCutPath = true;
        //printf("cut size: %d\n", edges.size());
        Scan::insertPolygons(edges, tabs.begin(), tabs.end(), true);
        for (size_t i = 0; i < edges.size(); ++i)
            edges[i].index = i;

        Scan::intersectEdges(edges, edges.begin(), edges.end());
        Scan::sortEdges(edges.begin(), edges.end());
        Scan::scan(
            edges.begin(), edges.end(),
            makeAccumulateWindingNumber([](ScanlineEdge& e){return !e.edge->isCutPath; }),
            SetIsOverTab{});

        sort(edges.begin(), edges.end(), [](const Edge& a, const Edge& b){
            return combineLess(
                a, b,
                [](const Edge& a, const Edge& b){return (!a.isCutPath) < (!b.isCutPath); },
                [](const Edge& a, const Edge& b){return a.index < b.index; });
        });
        for (auto& edge: edges)
            if (swapped(edge))
                swap(edge.point1, edge.point2);

        PolygonSet result{{}};
        bool isOverTab = false;
        Point currentPoint = paths[0][0];
        auto pos = edges.begin();
        while (pos != edges.end()) {
            if (!pos->isCutPath)
                break;
            auto e = pos;
            while (e != edges.end() && e->isCutPath && e->index == pos->index)
                ++e;
            bool found = false;
            for (auto p = pos; p != e; ++p) {
                if (!p->taken && p->point1 == currentPoint) {
                    if (p->isOverTab != isOverTab) {
                        if (!result.back().empty())
                            result.back().emplace_back(currentPoint);
                        result.emplace_back();
                        isOverTab = p->isOverTab;
                    }
                    result.back().emplace_back(currentPoint);
                    currentPoint = p->point2;
                    p->taken = true;
                    found = true;
                    break;
                }
            }
            if (!found) {
                error = true;
                convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, paths);
                return;
            }
            bool allTaken = true;
            for (auto p = pos; p != e; ++p)
                if (!p->taken)
                    allTaken = false;
            if (allTaken)
                pos = e;
        }
        result.back().emplace_back(currentPoint);

        //printf("separateTabs: %d\n", result.size());
        convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, result);
    }
    catch (exception& e) {
        printf("%s\n", e.what());
    }
    catch (...) {
        printf("???? unknown exception\n");
    }
};
