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

#include "cam.h"
#include "offset.h"
#include <boost/polygon/voronoi.hpp>

using namespace FlexScan;
using namespace cam;
using namespace std;

template<typename Derived>
struct VoronoiEdge {
    struct Index {
        PointWithZ point;
        PointWithZ otherPoint;
        Derived* edge;
        bool isPoint2;
        bool taken = false;

        Index() = default;
        Index(PointWithZ point, PointWithZ otherPoint = {}, bool isPoint2 = false, Derived* edge = nullptr) :
            point{point},
            otherPoint{otherPoint},
            edge{edge},
            isPoint2{isPoint2}
        {
        }

        Index(const Index&) = default;
        Index& operator=(const Index&) = default;

        bool operator<(const Index& rhs) const
        {
            return this->point.x < rhs.point.x || this->point.x == rhs.point.x && this->point.y < rhs.point.y;
        }
    };

    bool isGeometry = false;
    bool isInGeometry = false;
    bool taken = false;
    Index* index1 = nullptr;
    Index* index2 = nullptr;
    size_t sourceIndex = 0;

    void setTaken() {
        taken = true;
        index1->taken = true;
        index2->taken = true;
    }
};

struct SetIsInGeometry {
    template<typename Unit, typename HighPrecision, typename It>
    void operator()(Unit x, HighPrecision y, It begin, It end) const
    {
        while (begin != end) {
            begin->edge->isInGeometry = begin->windingNumberBefore && begin->windingNumberAfter;
            ++begin;
        }
    }
};

template<typename F>
void getCorner(const Segment& s1, const Segment& s2, F f)
{
    if (low(s1) == low(s2))
        f(low(s1), high(s1), high(s2));
    else if (low(s1) == high(s2))
        f(low(s1), high(s1), low(s2));
    else if (high(s1) == low(s2))
        f(high(s1), low(s1), high(s2));
    else if (high(s1) == high(s2))
        f(high(s1), low(s1), low(s2));
}

static double lenSquared(PointWithZ p)
{
    return (double)x(p)*x(p) + (double)y(p)*y(p);
}

static double len(PointWithZ p)
{
    return sqrt(lenSquared(p));
}

static double projectionRatio(PointWithZ lineBegin, PointWithZ lineEnd, PointWithZ p)
{
    return (double)dot(lineEnd-lineBegin, p-lineBegin) / lenSquared(lineEnd-lineBegin);
}

static double dist(Point p, const Segment& s)
{
    auto a = low(s);
    auto delta = high(s)-low(s);
    double l = len(delta);
    double nx = x(delta)/l;
    double ny = y(delta)/l;
    double dot = (x(a) - x(p)) * nx + (y(a) - y(p)) * ny;
    double rx = x(a) - x(p) - nx * dot;
    double ry = y(a) - y(p) - ny * dot;
    double result = sqrt(rx * rx + ry * ry);
    return result;
}

// Linearize the parabola which is equidistant from p and s. The parabola's
// endpoints are begin, end.
template<typename Edge>
void linearizeParabola(vector<Edge>& edges, Point p, Segment s, PointWithZ begin, PointWithZ end, double angle)
{
    PointWithZ p1 = low(s);
    PointWithZ p2 = high(s);
    int deltaX = x(p2) - x(p1);
    int deltaY = y(p2) - y(p1);

    //printf("curve\n");

    size_t numSegments = 20;
    auto tbegin = projectionRatio(p1, p2, begin);
    auto tend = projectionRatio(p1, p2, end);

    bool done = false;
    while (!done) {
        done = true;
        PointWithZ lastPoint = begin;
        for (size_t i = 0; i <= numSegments; ++i) {
            double t = tbegin + (tend-tbegin)*i/numSegments;

            // {xt, yt} traces s
            int xt = x(p1) + lround(deltaX * t);
            int yt = y(p1) + lround(deltaY * t);

            // {ax, ay} is p relative to {xt, yt}
            int ax = x(p) - xt;
            int ay = y(p) - yt;

            double aLengthSquare = (double)ax*ax + (double)ay*ay;
            double denom = 2*((double)ax*deltaY - (double)ay*deltaX);

            int thisX = xt + lround((double)deltaY * aLengthSquare / denom);
            int thisY = yt - lround((double)deltaX * aLengthSquare / denom);

            if (i == numSegments) {
                thisX = end.x;
                thisY = end.y;
            }

            int thisZ = -lround(len(Point{thisX, thisY} - p) / tan(angle/2));

            if (i == 0)
                lastPoint.z = thisZ;
            else {
                edges.emplace_back(lastPoint, PointWithZ{thisX, thisY, thisZ}, true);
                lastPoint = PointWithZ{thisX, thisY, thisZ};
            }
        }
    }
} // linearizeParabola

template<typename ScanlineEdge>
vector<typename ScanlineEdge::Edge> getVoronoiEdges(int debugArg0, int debugArg1, PolygonSet& geometry, double angle)
{
    using Edge = typename ScanlineEdge::Edge;
    using Scan = Scan<ScanlineEdge>;

    vector<Segment> segments;
    for (auto& poly: geometry) {
        for (size_t i = 0; i < poly.size(); ++i) {
            if (i+1 < poly.size())
                segments.emplace_back(poly[i], poly[i+1]);
            else
                segments.emplace_back(poly[i], poly[0]);
        }
    }

    printf("b\n");
    bp::voronoi_diagram<double> vd;
    bp::default_voronoi_builder builder;
    for (auto& segment: segments)
        builder.insert_segment(x(low(segment)), y(low(segment)), x(high(segment)), y(high(segment)));
    printf("c\n");
    builder.construct(&vd);

    vector<Edge> filterEdges;
    printf("d\n");
    Scan::insertPolygons(filterEdges, geometry.begin(), geometry.end(), true);
    printf("e\n");
    for (size_t i = 0; i < filterEdges.size(); ++i)
        filterEdges[i].isGeometry = true;

    for (auto& edge: vd.edges())
        edge.color(0);
    printf("f: %d voronoi edges\n", vd.edges().size());

    for (size_t i = 0; i < vd.edges().size(); ++i) {
        auto& edge = vd.edges()[i];
        if (edge.is_primary() && edge.is_finite() && !(edge.color()&1)) {
            edge.color(1);
            edge.twin()->color(1);
            Point p1{lround(edge.vertex0()->x()), lround(edge.vertex0()->y())};
            Point p2{lround(edge.vertex1()->x()), lround(edge.vertex1()->y())};
            filterEdges.emplace_back(p1, p2, true);
            filterEdges.back().sourceIndex = i;
        }
    }

    printf("g1: %d filterEdges\n", filterEdges.size());
    Scan::intersectEdges(filterEdges, filterEdges.begin(), filterEdges.end());
    printf("g2: %d filterEdges\n", filterEdges.size());
    Scan::sortEdges(filterEdges.begin(), filterEdges.end());
    printf("g3: %d filterEdges\n", filterEdges.size());
    Scan::scan(
        filterEdges.begin(), filterEdges.end(),
        makeAccumulateWindingNumber([](ScanlineEdge& e){return e.edge->isGeometry; }),
        SetIsInGeometry{});
    printf("g4\n");

    vector<Edge> edges;
    for (auto& e: filterEdges) {
        if (e.isGeometry || !e.isInGeometry)
            continue;

        auto& edge = vd.edges()[e.sourceIndex];

        //if (debugArg0 && edges.size() == (size_t)debugArg0)
        //    break;
        auto cell = edge.cell();
        auto twinCell = edge.twin()->cell();
        Point p1{lround(edge.vertex0()->x()), lround(edge.vertex0()->y())};
        Point p2{lround(edge.vertex1()->x()), lround(edge.vertex1()->y())};

        if (edge.is_linear()) {
            auto segment1 = segments[cell->source_index()];
            auto segment2 = segments[twinCell->source_index()];
            bool keep = true;
            getCorner(segment1, segment2, [&keep](Point center, Point e1, Point e2) {
                double c = dot(e1-center, e2-center) / euclidean_distance(e1, center) / euclidean_distance(e2, center);
                if (c <= cos(95/2/M_PI))
                    keep = false;
            });
            if (!keep)
                continue;

            if (cell->source_category() == bp::SOURCE_CATEGORY_SEGMENT_START_POINT || cell->source_category() == bp::SOURCE_CATEGORY_SEGMENT_END_POINT) {
                PointWithZ ref;
                if (cell->source_category() == bp::SOURCE_CATEGORY_SEGMENT_START_POINT)
                    ref = low(segments[cell->source_index()]);
                else
                    ref = high(segments[cell->source_index()]);
                int numSegments = 20;
                PointWithZ lastPoint;
                for (int i = 0; i <= numSegments; ++i) {
                    PointWithZ p{
                        lround(x(p1) + (double)i * (x(p2) - x(p1)) / numSegments),
                        lround(y(p1) + (double)i * (y(p2) - y(p1)) / numSegments)};
                    p.z = -lround(len(p - ref) / tan(angle/2));
                    //printf("zzz0: %d, %d, i: %d, p:(%d, %d), p1: (%d, %d), p2: (%d, %d), ref:(%d, %d)\n", lastPoint.z, p.z, i, x(p), y(p), x(p1), y(p1), x(p2), y(p2), x(ref), y(ref));
                    if (i)
                        edges.emplace_back(lastPoint, p, true);
                    lastPoint = p;
                }
            }
            else
            {
                double dist1 = dist(p1, segments[cell->source_index()]);
                double dist2 = dist(p2, segments[cell->source_index()]);
                int z1 = -lround(dist1 / tan(angle/2));
                int z2 = -lround(dist2 / tan(angle/2));
                //printf("zzz1: %d, %d\n", z1, z2);
                edges.emplace_back(Edge{{x(p1), y(p1), z1}, {x(p2), y(p2), z2}, true});
            }

        }
        else if (edge.is_curved()) {
            Point point;
            Segment segment;

            if (cell->contains_point()) {
                if (cell->source_category() == bp::SOURCE_CATEGORY_SEGMENT_START_POINT)
                    point = low(segments[cell->source_index()]);
                else
                    point = high(segments[cell->source_index()]);
                segment = segments[twinCell->source_index()];
            }
            else {
                if (twinCell->source_category() == bp::SOURCE_CATEGORY_SEGMENT_START_POINT)
                    point = low(segments[twinCell->source_index()]);
                else
                    point = high(segments[twinCell->source_index()]);
                segment = segments[cell->source_index()];
            }

            linearizeParabola(edges, point, segment, p1, p2, angle);
        }
    }

    printf("g5: %d edges\n", edges.size());
    return edges;
} // getVoronoiEdges

template<typename Edge, typename Callback>
void reorderEdges(int debugArg0, int debugArg1, vector<Edge>& edges, Callback callback) {
    printf("i\n");
    vector<typename Edge::Index> edgeIndexes;
    edgeIndexes.reserve(edges.size() * 2);
    for (auto& edge: edges) {
        edgeIndexes.emplace_back(edge.point1, edge.point2, false, &edge);
        edgeIndexes.emplace_back(edge.point2, edge.point1, true, &edge);
    }
    sort(edgeIndexes.begin(), edgeIndexes.end());
    for (auto& edgeIndex: edgeIndexes) {
        if (edgeIndex.isPoint2)
            edgeIndex.edge->index2 = &edgeIndex;
        else
            edgeIndex.edge->index1 = &edgeIndex;
    }

    printf("j: edgeIndexes: %d\n", edgeIndexes.size());
    auto start = find_if(edgeIndexes.begin(), edgeIndexes.end(), [](const typename Edge::Index& index){return !index.point.z; });
    if (start == edgeIndexes.end())
        start = edgeIndexes.begin(); // !!!!
    start->edge->setTaken();
    if (start->isPoint2)
        swap(start->edge->point1, start->edge->point2);
    PointWithZ p = callback(*start->edge, edges.size() == 1);
    size_t numProcessed = 1;

    auto rank = [&p](const typename Edge::Index& e) {
        if ((e.point.z == 0) != (p.z == 0) || e.point != p) {
            if (e.point.z != 0)
                return 0;
            else
                return 1;
        }
        if ((e.otherPoint.z == 0) != (p.z == 0))
            return 2;
        return 3;
    };

    printf("k\n");
    while (numProcessed < edges.size()) {
        //printf("numProcessed: %d/%d\n", numProcessed, edges.size());
        auto searchStart = lower_bound(edgeIndexes.begin(), edgeIndexes.end(), typename Edge::Index{p});
        auto closest = edgeIndexes.begin();
        int closestRank = 0;
        int closestZdist = numeric_limits<int>::max();
        int closestOtherZdist = numeric_limits<int>::max();
        double closestDist = numeric_limits<double>::max();

        //if (debugArg0 && numProcessed == (size_t)debugArg0)
        //    break;

        //if (debugArg1 && numProcessed == (size_t)debugArg1)
        //    printf("P: %d, %d, %d\n", p.x, p.y, p.z);

        auto setClosest = [&](typename vector<typename Edge::Index>::iterator it) -> bool{
            if (!it->taken) {
                int r = rank(*it);
                int zDist = abs(p.z - it->point.z);
                int otherZdist = abs(p.z - it->otherPoint.z);
                double dist = lenSquared(p - it->point);

                if (closestRank >= 1 && abs(it->point.x - p.x) > closestDist)
                    return false;

                if (r > closestRank || r == closestRank && (
                    it->point == p && zDist < closestZdist || (it->point != p || zDist == closestZdist) && (
                    it->point == p && otherZdist < closestOtherZdist || (it->point != p || otherZdist == closestOtherZdist) &&
                    dist < closestDist))) {

                    //if (debugArg1 && numProcessed == (size_t)debugArg1)
                    //    printf("  +rank: %d zDist:%d otherZdist:%d dist: %lld (%d, %d, %d) -> (%d, %d, %d)\n", r, zDist, otherZdist, llround(dist), it->point.x, it->point.y, it->point.z, it->otherPoint.x, it->otherPoint.y, it->otherPoint.z);
                    closest = it;
                    closestZdist = zDist;
                    closestOtherZdist = otherZdist;
                    closestDist = dist;
                    closestRank = r;
                }
                //else if (debugArg1 && numProcessed == (size_t)debugArg1/* && p == it->point)*/)
                //    printf("  -rank: %d zDist:%d otherZdist:%d dist: %lld (%d, %d, %d) -> (%d, %d, %d)\n", r, zDist, otherZdist, llround(dist), it->point.x, it->point.y, it->point.z, it->otherPoint.x, it->otherPoint.y, it->otherPoint.z);
            }
            return true;
        };

        for (auto it2 = searchStart; it2 != edgeIndexes.end(); ++it2)
            if (!setClosest(it2))
                break;
        for (auto it2 = searchStart; it2 != edgeIndexes.begin(); --it2)
            if (!setClosest(it2 - 1))
                break;

        if (p.z == 0 && closest->point.z != 0)
            printf("dive\n");
        if (p.z != 0 && closest->point.z == 0)
            printf("retract\n");

        closest->edge->setTaken();
        if (closest->isPoint2)
            swap(closest->edge->point1, closest->edge->point2);

        //if (debugArg1 && numProcessed == (size_t)debugArg1)
        //    printf("Old P: %d, %d, %d\n", p.x, p.y, p.z);

        //if (debugArg1 && numProcessed == (size_t)debugArg1)
        //    for (auto& ind: edgeIndexes)
        //        if (ind.point.x == p.x && ind.point.y == p.y)
        //            printf("  (%d, %d, %d) -> (%d, %d, %d) taken=%d\n", ind.point.x, ind.point.y, ind.point.z, ind.otherPoint.x, ind.otherPoint.y, ind.otherPoint.z, ind.taken);

        p = callback(*closest->edge, edges.size() == numProcessed + 1);
        ++numProcessed;

        //if (debugArg1 && numProcessed == (size_t)debugArg1)
        //    printf("New P: %d, %d, %d\n", p.x, p.y, p.z);
    } // while (numProcessed < edges.size())
} // reorderEdges

template<typename Edge>
void clipTopZ(double passDepth, double maxDepth, vector<PointWithZ>& path, const Edge& edge)
{
    if (path.empty() || path.back() != edge.point1 || path.back().z != edge.point1.z)
        path.push_back(edge.point1);
    if (path.empty() || path.back() != edge.point2 || path.back().z != edge.point2.z)
        path.push_back(edge.point2);
}

template<typename Edge>
void processSpan(double passDepth, double maxDepth, vector<vector<PointWithZ>>& result, vector<Edge>& span)
{
    //printf("processSpan\n");
    //passDepth = min(passDepth, maxDepth);
    int minZ = 0;
    for (auto& edge: span)
        minZ = min(minZ, min(edge.point1.z, edge.point2.z));

    vector<PointWithZ> path;

    int deltaZ = max(0.0, -passDepth - minZ);
    //printf("    span: %d, passDepth: %d, minZ: %d, deltaZ: %d\n", span.size(), (int)passDepth, minZ, deltaZ);

    bool reverse = false;
    while (true) {
        //printf("    span: %d, reverse: %d, deltaZ: %d\n", span.size(), reverse, deltaZ);

        if (reverse) {
            for (auto it = span.rbegin(); it != span.rend(); ++it)
            {
                clipTopZ(passDepth, maxDepth, path, Edge{
                    PointWithZ{it->point2.x, it->point2.y, it->point2.z + deltaZ},
                    PointWithZ{it->point1.x, it->point1.y, it->point1.z + deltaZ}, false});
            }
        }
        else {
            for (auto& edge: span)
            {
                clipTopZ(passDepth, maxDepth, path, Edge{
                    PointWithZ{edge.point1.x, edge.point1.y, edge.point1.z + deltaZ},
                    PointWithZ{edge.point2.x, edge.point2.y, edge.point2.z + deltaZ}, false});
            }
        }

        if (deltaZ == 0)
            break;
        deltaZ = max(0.0, deltaZ - passDepth);
        reverse = !reverse;
    }

    if (path.front().z != 0)
        path.insert(path.begin(), PointWithZ{path.front().x, path.front().y, 0});
    if (path.back().z != 0)
        path.insert(path.end(), PointWithZ{path.back().x, path.back().y, 0});
    result.emplace_back(move(path));
    //printf("    result: %d\n", result.size());
}

extern "C" void vPocket(
    int debugArg0, int debugArg1,
    double** paths, int numPaths, int* pathSizes,
    double cutterAngle, double passDepth, double maxDepth,
    double**& resultPaths, int& resultNumPaths, int*& resultPathSizes)
{
    try {
        using Edge = Edge<PointWithZ, VoronoiEdge>;
        using ScanlineEdge = ScanlineEdge<Edge, ScanlineEdgeWindingNumber>;
        double angle = cutterAngle * M_PI / 180;

        printf("a\n");
        PolygonSet geometry = convertPathsFromC(paths, numPaths, pathSizes);

        auto edges = getVoronoiEdges<ScanlineEdge>(debugArg0, debugArg1, geometry, angle);

        if (edges.empty()) {
            convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, vector<vector<PointWithZ>>{});
            return;
        }

        vector<Edge> span;
        vector<vector<PointWithZ>> result;
        reorderEdges(debugArg0, debugArg1, edges, [passDepth, maxDepth, &span, &result](Edge& edge, bool isLast) {
            if (!span.empty() && edge.point1 != span.back().point2) {
                processSpan(passDepth, maxDepth, result, span);
                span.clear();
            }

            span.emplace_back(edge);

            if (isLast || edge.point2.z == 0) {
                processSpan(passDepth, maxDepth, result, span);
                span.clear();
            }

            if (!span.empty())
                return span.back().point2;
            else
                return result.back().back();
        });

        printf("z - done\n");
        convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, result);
        return;
    }
    catch (exception& e) {
        printf("%s\n", e.what());
    }
    catch (...) {
        printf("???? unknown exception\n");
    }
};
