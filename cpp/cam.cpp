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

#include "FlexScan.h"

#include <algorithm>
#include <chrono>
#include <cmath>

using namespace boost::polygon::operators;
using namespace std;

using Point = boost::polygon::point_data<int>;
using Segment = boost::polygon::segment_data<int>;
using Polygon = vector<Point>;
using PolygonWithHoles = boost::polygon::polygon_with_holes_data<int>;
using PolygonSet = vector<Polygon>;
using PolygonWithHolesSet = vector<PolygonWithHoles>;
using PolygonSetData = boost::polygon::polygon_set_data<int>;

static const long long inchToClipperScale = 100000;
static const long long cleanPolyDist = inchToClipperScale / 100000;
static const long long arcTolerance = inchToClipperScale / 10000;
static const long long spiralArcTolerance = inchToClipperScale / 1000;

static Point operator+(const Point& a, const Point& b) {
    return{x(a)+x(b), y(a)+y(b)};
}

static Point operator-(const Point& a, const Point& b) {
    return{x(a)-x(b), y(a)-y(b)};
}

static Point& operator*=(Point& a, int scale) {
    a.x(a.x()*scale);
    a.y(a.y()*scale);
    return a;
}

static long long dot(const Point& a, const Point& b) {
    return (long long)x(a)*x(b) + (long long)y(a)*y(b);
}

static double deltaAngleForError(double e, double r) {
    e = min(r/2, e);
    return acos(2*(1-e/r)*(1-e/r)-1);
}

void convert(PolygonSet& ppp, const PolygonWithHoles& pwh) {
    Polygon xxx;
    for (auto& x: pwh)
        xxx.push_back(x);
    ppp.push_back(move(xxx));
    for (auto it = pwh.begin_holes(); it != pwh.end_holes(); ++it)
    {
        Polygon g;
        for (auto& x: *it)
            g.push_back(x);
        ppp.push_back(move(g));
    }
}

void convert(PolygonSet& ppp, const PolygonWithHolesSet& pwhs) {
    for (auto& pwh: pwhs)
        convert(ppp, pwh);
}

namespace boost {
    namespace polygon {
        template <>
        struct geometry_concept<Polygon>{ typedef polygon_concept type; };

        template <>
        struct polygon_traits<Polygon> {
            typedef int coordinate_type;
            typedef Polygon::const_iterator iterator_type;
            typedef Point point_type;

            static inline iterator_type begin_points(const Polygon& t) {
                return t.begin();
            }

            static inline iterator_type end_points(const Polygon& t) {
                return t.end();
            }

            static inline std::size_t size(const Polygon& t) {
                return t.size();
            }

            static inline winding_direction winding(const Polygon& t) {
                return counterclockwise_winding;
            }
        };

        template <>
        struct polygon_mutable_traits<Polygon> {
            //expects stl style iterators
            template <typename iT>
            static inline Polygon& set_points(Polygon& t,
                iT input_begin, iT input_end) {
                t.clear();
                t.insert(t.end(), input_begin, input_end);
                return t;
            }

        };
    }
}

//struct CandidatePath {
//    Path path;
//    double distToCurrentPos;
//};

static void clean(PolygonSet& ps) {
    // !!!! todo: convert from psd instead of pwhs
    PolygonSetData psd{ps.begin(), ps.end()};
    PolygonWithHolesSet pwhs;
    psd.get(pwhs);
    printf("pwhs polys: %d\n", pwhs.size());
    ps.clear();
    convert(ps, pwhs);
}

static Polygon rawOffset(const Polygon& path, int amount, bool closed) {
    if (amount == 0)
        return path;
    if (path.size() < 2)
        return{};

    auto constructStartTime = std::chrono::high_resolution_clock::now();

    auto processSegment = [](Polygon& raw, const Point& p0, const Point& p1, const Point& p2, int amount) {
        if (p1 == p0)
            return;

        auto getNormal = [](const Point& p1, const Point& p2, int amount) -> Point {
            double length = euclidean_distance(p1, p2);
            return{lround(double(y(p2)-y(p1))*amount/length), lround(double(x(p1)-x(p2))*amount/length)};
        };

        auto normal01 = getNormal(p0, p1, amount);
        auto normal12 = getNormal(p1, p2, amount);
        auto o = orientation(Segment{p1, p1+normal01}, Segment{p1, p1+normal12});
        if (amount < 0)
            o = -o;

        // turn left
        if (o == 1 || o == 0 && dot(normal01, normal12) < 0) {
            raw.push_back(p1+normal01);

            double baseAngle = atan2(y(normal01), x(normal01));
            double q = ((double)x(normal01)*x(normal12) + (double)y(normal01)*y(normal12)) / amount / amount;
            q = min(1.0, max(-1.0, q));
            double sweepAngle = acos(q);
            int numSegments = ceil(sweepAngle / deltaAngleForError(arcTolerance, labs(amount)));
            if (amount < 0) {
                baseAngle += M_PI;
                sweepAngle = -sweepAngle;
            }

            for (int i = 1; i < numSegments; ++i) {
                double angle = baseAngle + sweepAngle*i/numSegments;
                raw.push_back({lround(x(p1)+amount*cos(angle)), lround(y(p1)+amount*sin(angle))});
            }

            raw.push_back(p1+normal12);
        }

        // straight
        else if (o == 0) {
            raw.push_back(p1+normal01);
        }

        // turn right
        else {
            raw.push_back(p1+normal01);
            raw.push_back(p1);
            raw.push_back(p1+normal12);
        }
    };

    Polygon raw;
    if (closed) {
        const Point* p0 = &path.back();
        const Point* p1 = &path[0];
        for (size_t i = 0; i+1 < path.size(); ++i) {
            const Point* p2 = &path[i+1];
            processSegment(raw, *p0, *p1, *p2, amount);
            p0 = p1;
            p1 = p2;
        }
        const Point* p2 = &path[0];
        processSegment(raw, *p0, *p1, *p2, amount);
    }
    else {
        const Point* p0 = &path[1];
        const Point* p1 = &path[0];
        for (size_t i = 0; i+1 < path.size(); ++i) {
            const Point* p2 = &path[i+1];
            processSegment(raw, *p0, *p1, *p2, amount);
            p0 = p1;
            p1 = p2;
        }
        for (size_t i = path.size()-1; i > 0; --i) {
            const Point* p2 = &path[i-1];
            processSegment(raw, *p0, *p1, *p2, amount);
            p0 = p1;
            p1 = p2;
        }
    }

    printf("offset construct: %d\n", (int)std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::high_resolution_clock::now() - constructStartTime).count());

    return raw;
}

static PolygonSet offset(const Polygon& path, int amount, bool closed) {
    Polygon raw = rawOffset(path, amount, closed);
    PolygonSet result;
    result.push_back(move(raw));

    auto cleanStartTime = std::chrono::high_resolution_clock::now();
    clean(result);
    printf("offset clean: %d\n", (int)std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::high_resolution_clock::now() - cleanStartTime).count());

    return result;
}

static PolygonSet offset(const PolygonSet& ps, int amount, bool closed) {
    PolygonSet result;
    for (auto& poly: ps) {
        Polygon raw = rawOffset(poly, amount, closed);
        printf("%d -> %d\n", poly.size(), raw.size());
        result.push_back(move(raw));
    }

    auto cleanStartTime = std::chrono::high_resolution_clock::now();
    clean(result);
    printf("offset clean: %d\n", (int)std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::high_resolution_clock::now() - cleanStartTime).count());
    printf("polys: %d\n", result.size());

    return result;
}

// Convert paths to C format
static void convertPathsToC(
    double**& cPaths, int& cNumPaths, int*& cPathSizes,
    const PolygonSet& paths
    )
{
    //!!!! don't need double
    cPaths = (double**)malloc(paths.size() * sizeof(double*));
    cNumPaths = paths.size();
    cPathSizes = (int*)malloc(paths.size() * sizeof(int));
    for (size_t i = 0; i < paths.size(); ++i) {
        const Polygon& path = paths[i];
        cPathSizes[i] = path.size();
        char* pathStorage = (char*)malloc(path.size() * 2 * sizeof(double) + sizeof(double) / 2);
        // cPaths[i] contains the unaligned block so the javascript side can free it properly.
        cPaths[i] = (double*)pathStorage;
        if ((int)pathStorage & 4)
            pathStorage += 4;
        double* p = (double*)pathStorage;
        for (size_t j = 0; j < path.size(); ++j) {
            p[j*2] = x(path[j]);
            p[j*2+1] = y(path[j]);
        }
    }
}

extern "C" void hspocket(
    double** paths, int numPaths, int* pathSizes, double cutterDia,
    double**& resultPaths, int& resultNumPaths, int*& resultPathSizes
    ) 
{
    try {
        PolygonSet geometry;
        for (int i = 0; i < numPaths; ++i) {
            geometry.push_back(vector<Point>{});
            auto& newPath = geometry.back();
            double* p = paths[i];
            int l = pathSizes[i];
            for (int j = 0; j < l; ++j)
                newPath.push_back({lround(p[j*2]), lround(p[j*2+1])});
        }

        int startX = lround(67 / 25.4 * inchToClipperScale);
        int startY = lround(72 / 25.4 * inchToClipperScale);
        int stepover = cutterDia / 4;
        double spiralR = 60 / 25.4 * inchToClipperScale;
        //int minRadius = cutterDia / 2;
        int minRadius = cutterDia / 8;
        int minProgress = lround(stepover / 8);
        int precision = lround(inchToClipperScale / 5000);

        PolygonSet safeArea = offset(geometry, -cutterDia / 2, true);
        //convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, safeArea);
        //return;

        Polygon spiral;
        {
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

            //Polygon combined{spiral};

            //void intersect_segments(
            //    vector<pair<size_t, Segment>* result,
            //    SegmentIterator first,
            //    SegmentIterator last)

            // !!!!!!!!!!!!!!!
            //Clipper clipper;
            //clipper.AddPath(spiral, ptSubject, false);
            //clipper.AddPaths(safeArea, ptClip, true);
            //PolyTree result;
            //clipper.Execute(ctIntersection, result, pftEvenOdd, pftEvenOdd);

            //bool found = false;
            //for (auto& child: result.Childs) {
            //    if (found)
            //        break;
            //    for (auto& point: child->Contour) {
            //        if (point.X == startX && point.Y == startY) {
            //            reverse(child->Contour.begin(), child->Contour.end());
            //            spiral = move(child->Contour);
            //            found = true;
            //            break;
            //        }
            //    }
            //}

            //if (!found)
            //{
            //    convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, {});
            //    return;
            //}
        };

        convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, {spiral});
        return;


        PolygonSet cutArea = offset(spiral, cutterDia / 2, false);
        //PolygonSet cutterPaths;
        //cutterPaths.push_back(move(spiral));

        //for (auto& poly: cutArea) {
        //    for (auto& pt: poly) {
        //        x(pt, (x(pt)-startX)*10+startX);
        //        y(pt, (y(pt)-startY)*10+startY);
        //    }
        //}
        convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, cutArea);


        //int currentX, currentY;

        //auto updateCurrentPos = [&]() {
        //    auto& lastPath = cutterPaths.back();
        //    auto& lastPos = lastPath.back();
        //    currentX = x(lastPos);
        //    currentY = y(lastPos);
        //};
        //updateCurrentPos();

//
//        //cutArea = cutArea.concat(cutterPaths);
//        //var camPaths = [];
//        //for (var i = 0; i < cutArea.length; ++i)
//        //    camPaths.push({ path: cutArea[i], safeToClose: false });
//        //return camPaths;
//
//        //var loopStartTime = Date.now();
//        auto loopStartTime = std::chrono::high_resolution_clock::now();
//
//        //int yyy = 200-40+5-50;
//        int yyy = 30-15;
//        int xxx = 0;
//        while (true) {
//            printf("%d\n", xxx);
//            ++xxx;
//            //if (xxx >= yyy)
//            //    break;
//            auto front = offset(cutArea, -cutterDia / 2 + stepover);
//            //auto back = offset(cutArea, -cutterDia / 2 + minProgress);
//            auto back = offset(front, minProgress - stepover);
//            auto q = clip(front, safeArea, ctIntersection);
//            q = offset(q, -minRadius);
//            q = offset(q, minRadius);
//            //for (auto& path: q)
//            //    path.push_back(path.front());
//
//            //if (xxx >= yyy) {
//            //    for (auto& path: q) {
//            //        printf("q f: %lld, %lld\n", path.front().X, path.front().Y);
//            //        printf("q  : %lld, %lld\n", (++path.begin())->X, (++path.begin())->Y);
//            //        printf("q  : %lld, %lld\n", (--path.end())->X, (--path.end())->Y);
//            //        printf("q b: %lld, %lld\n", path.back().X, path.back().Y);
//            //    }
//            //}
//
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
//
//        //console.log("hspocket loop: " + (Date.now() - loopStartTime));
//        printf("hspocket loop: %d\n", (int)std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::high_resolution_clock::now() - loopStartTime).count());
//
//        convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, cutterPaths);
    }
    catch (exception& e) {
        printf("%s\n", e.what());
    }
    catch (...) {
        printf("???? unknown exception\n");
    }
};
