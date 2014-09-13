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

//struct CandidatePath {
//    Path path;
//    double distToCurrentPos;
//};

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

        //int currentX, currentY;
        //auto updateCurrentPos = [&]() {
        //    auto& lastPath = cutterPaths.back();
        //    auto& lastPos = lastPath.back();
        //    currentX = x(lastPos);
        //    currentY = y(lastPos);
        //};
        //updateCurrentPos();

        auto loopStartTime = std::chrono::high_resolution_clock::now();

        //int yyy = 200-40+5-50;
        int yyy = 30-15;
        int xxx = 0;
//        while (true) {
            printf("%d\n", xxx);
            ++xxx;
            //if (xxx >= yyy)
            //    break;
            auto front = offset(cutArea, -cutterDia / 2 + stepover, arcTolerance, true);
            //auto back = offset(cutArea, -cutterDia / 2 + minProgress);
            auto back = offset(front, minProgress - stepover, arcTolerance, true);

            //auto q = safeArea;
            auto q = combinePolygonSet(front, safeArea, makeCombinePolygonSetCondition([](int w1, int w2){return w1 > 0 && w2 > 0; }));
            q = offset(q, -minRadius, arcTolerance, true);
            q = offset(q, minRadius, arcTolerance, true);

            convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, q, true);
            return;

//            printf("/a\n");
//
//            Clipper clipper;
//            clipper.AddPaths(q, ptSubject, false);
//            clipper.AddPaths(back, ptClip, true);
//            PolyTree result;
//            clipper.Execute(ctDifference, result, pftEvenOdd, pftEvenOdd);
//
//            printf("/b\n");
//
//            if (xxx >= yyy) {
//                //convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, q);
//                Paths p;
//                for (auto child: result.Childs)
//                    p.push_back(move(child->Contour));
//                convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, p);
//                return;
//            }
//
//
//            //for (auto child: result.Childs) {
//            //    auto& path = child->Contour;
//            //    for (auto& orig: q) {
//            //        if (path.back() == orig.back())
//            //            path.push_back(orig.front());
//            //        else if (path.front() == orig.front())
//            //            path.insert(path.begin(), orig.back());
//            //    }
//            //}
//
//            vector<pair<Path, Path*>> frontPaths;
//            vector<pair<Path, Path*>> backPaths;
//            Paths combinedPaths;
//            for (auto child: result.Childs) {
//                auto& path = child->Contour;
//                bool found = false;
//                for (auto& existing: q) {
//                    if (existing.front() == path.front()) {
//                        //if (xxx >= yyy) {
//                        //    cutterPaths.clear();
//                        //    cutterPaths.push_back(move(path));
//                        //    convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, cutterPaths);
//                        //    return;
//                        //}
//                        frontPaths.push_back(make_pair(move(path), &existing));
//                        found = true;
//                        printf("found front\n");
//                        break;
//                    }
//                    //?else if (existing.front() == path.front()) {
//                    //?    //if (xxx >= yyy) {
//                    //?    //    cutterPaths.clear();
//                    //?    //    cutterPaths.push_back(move(path));
//                    //?    //    convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, cutterPaths);
//                    //?    //    return;
//                    //?    //}
//                    //?    frontPaths.push_back(make_pair(move(path), &existing));
//                    //?    found = true;
//                    //?    printf("found front\n");
//                    //?    break;
//                    //?}
//                    else if (existing.back() == path.back()) {
//                        backPaths.push_back(make_pair(move(path), &existing));
//                        found = true;
//                        printf("found back\n");
//                        break;
//                    }
//                }
//                if (!found)
//                    combinedPaths.push_back(move(path));
//            }
//
//            printf("/c\n");
//
//
//            //if (xxx >= yyy) {
//            //    //cutterPaths.clear();
//            //    //cutterPaths.push_back(move(combinedPaths.front()));
//            //    //convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, cutterPaths);
//            //    convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, combinedPaths);
//            //    return;
//            //}
//
//            printf("/d\n");
//
//            for (auto& frontPath: frontPaths) {
//                auto it = find_if(backPaths.begin(), backPaths.end(), [&frontPath](pair<Path, Path*>& p){return p.second == frontPath.second; });
//                if (it != backPaths.end()) {
//                    auto& backPath = it->first;
//                    backPath.insert(backPath.end(), frontPath.first.begin(), frontPath.first.end());
//                    combinedPaths.push_back(move(backPath));
//                    backPaths.erase(it);
//                }
//                else
//                    combinedPaths.push_back(move(frontPath.first));
//            }
//
//            //if (xxx >= yyy) {
//            //    //cutterPaths.clear();
//            //    //cutterPaths.push_back(move(combinedPaths.front()));
//            //    //convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, cutterPaths);
//            //    convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, combinedPaths);
//            //    return;
//            //}
//
//
//
//            printf("/e\n");
//
//            //    bool merged = false;
//            //    for (auto& existing: combinedPaths) {
//            //        if (existing.back() == path.front()) {
//            //            printf("!1\n");
//            //            existing.insert(existing.end(), path.begin(), path.end());
//            //            merged = true;
//            //            break;
//            //        }
//            //        else if (existing.front() == path.back()) {
//            //            printf("!2\n");
//            //            path.insert(path.end(), existing.begin(), existing.end());
//            //            existing = move(path);
//            //            merged = true;
//            //            break;
//            //        }
//            //    }
//            //    if (!merged)
//            //        combinedPaths.push_back(move(path));
//            //}
//
//            //if (xxx >= yyy) {
//            //    cutterPaths = combinedPaths;
//            //    for (auto& path: combinedPaths) {
//            //        printf("f: %lld, %lld\n", path.front().X, path.front().Y);
//            //        printf(" : %lld, %lld\n", (++path.begin())->X, (++path.begin())->Y);
//            //        printf(" : %lld, %lld\n", (--path.end())->X, (--path.end())->Y);
//            //        printf("b: %lld, %lld\n", path.back().X, path.back().Y);
//            //    }
//            //    cutterPaths.insert(cutterPaths.end(), back.begin(), back.end());
//            //    break;
//            //}
//
//            printf("/f\n");
//
//            vector<CandidatePath> candidates;
//            for (auto& path: combinedPaths) {
//                double d = dist(path.back().X, path.back().Y, currentX, currentY);
//                candidates.push_back({move(path), d});
//            }
//            make_heap(candidates.begin(), candidates.end(), [](CandidatePath& a, CandidatePath& b){return a.distToCurrentPos > b.distToCurrentPos; });
//
//            printf("/g\n");
//
//            bool found = false;
//            while (!found && !candidates.empty()) {
//                auto& newCutterPath = candidates.front().path;
//                reverse(newCutterPath.begin(), newCutterPath.end());
//                // corrupts open: CleanPolygon(newCutterPath, precision);
////auto ccc = newCutterPath;
//                auto newCutArea = offset(newCutterPath, cutterDia / 2, jtRound, etOpenRound);
//                if (!clip(newCutArea, cutArea, ctDifference).empty()) {
//
//                    //if (xxx >= yyy) {
//                    //    cutterPaths.clear();
//                    //    //cutterPaths.push_back(move(newCutterPath));
//                    //    cutterPaths.push_back(move(ccc));
//                    //    convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, cutterPaths);
//                    //    return;
//                    //}
//
//
//                    cutterPaths.push_back(move(newCutterPath));
//                    cutArea = clip(cutArea, newCutArea, ctUnion);
//                    updateCurrentPos();
//                    found = true;
//                }
//                else {
//                    pop_heap(candidates.begin(), candidates.end(), [](CandidatePath& a, CandidatePath& b){return a.distToCurrentPos > b.distToCurrentPos; });
//                    candidates.pop_back();
//                }
//            }
//
//            printf("/h\n");
//
//            if (!found)
//                break;
//
//            if (xxx >= yyy) {
//                //cutterPaths = cutArea.concat(newCutArea);
//                break;
//            }
//        }

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
