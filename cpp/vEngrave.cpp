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
        bool isPoint2;
        bool taken = false;
        Derived* edge;

        Index(PointWithZ point = {}, bool isPoint2 = false, Derived* edge = nullptr) :
            point{point},
            isPoint2{isPoint2},
            edge{edge}
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

    //printf("    dist\n");
    //printf("        a     = %d, %d\n", x(a), y(a));
    //printf("        other = %d, %d\n", x(high(s)), y(high(s)));
    //printf("        delta = %d, %d\n", x(delta), y(delta));
    //printf("        l     = %f\n", l);
    //printf("        n     = %f, %f\n", nx, ny);
    //printf("        n len = %f\n", sqrt(nx*nx + ny*ny));
    //printf("        dot   = %f\n", dot);
    //printf("        r     = %f, %f\n", rx, ry);
    //printf("        result= %f\n", result);

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
            int thisZ = -lround(len(Point{thisX, thisY} - p) / tan(angle/2));

            if (i == 0)
                lastPoint.z = thisZ;
            else if (i == numSegments)
                edges.emplace_back(lastPoint, PointWithZ{end.x, end.y, thisZ});
            else {
                edges.emplace_back(lastPoint, PointWithZ{thisX, thisY, thisZ});
                lastPoint = PointWithZ{thisX, thisY};
            }
        }
    }
} // linearizeParabola

extern "C" void vPocket(
    double** paths, int numPaths, int* pathSizes,
    double cutterAngle, double passDepth, double maxDepth,
    double**& resultPaths, int& resultNumPaths, int*& resultPathSizes)
{
    double angle = cutterAngle * M_PI / 180;

    try {
        using Edge = Edge<PointWithZ, VoronoiEdge>;
        using ScanlineEdge = ScanlineEdge<Edge, ScanlineEdgeWindingNumber>;
        using Scan = Scan<ScanlineEdge>;

        printf("a\n");
        PolygonSet geometry = convertPathsFromC(paths, numPaths, pathSizes);

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

        vector<Edge> edges;
        printf("d\n");
        Scan::insertPolygons(edges, geometry.begin(), geometry.end(), true);
        printf("e\n");
        for (size_t i = 0; i < edges.size(); ++i)
            edges[i].isGeometry = true;

        for (auto& edge: vd.edges())
            edge.color(0);
        printf("f\n");
        for (auto& edge: vd.edges()) {
            if (edge.is_primary() && edge.is_finite() && !(edge.color()&1)) {
                auto cell = edge.cell();
                auto twinCell = edge.twin()->cell();
                Point p1{lround(edge.vertex0()->x()), lround(edge.vertex0()->y())};
                Point p2{lround(edge.vertex1()->x()), lround(edge.vertex1()->y())};

                if (edge.is_linear()) {
                    edge.color(1);
                    edge.twin()->color(1);
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

                    double dist1, dist2;
                    if (cell->source_category() == bp::SOURCE_CATEGORY_SEGMENT_START_POINT) {
                        //printf("Case A\n");
                        dist1 = len(p1 - low(segments[cell->source_index()]));
                        dist2 = len(p2 - low(segments[cell->source_index()]));
                    }
                    else if (cell->source_category() == bp::SOURCE_CATEGORY_SEGMENT_END_POINT) {
                        //printf("Case B\n");
                        dist1 = len(p1 - high(segments[cell->source_index()]));
                        dist2 = len(p2 - high(segments[cell->source_index()]));
                    }
                    else
                    {
                        //printf("Case C\n");
                        //printf("?: %d %d (%d %d %d)\n", cell->source_category(), twinCell->source_category(), bp::SOURCE_CATEGORY_SEGMENT_START_POINT, bp::SOURCE_CATEGORY_SEGMENT_END_POINT, bp::SOURCE_CATEGORY_SINGLE_POINT);
                        //printf("s: (%d, %d), (%d, %d)\n", x(low(segments[cell->source_index()])), y(low(segments[cell->source_index()])), x(high(segments[cell->source_index()])), y(high(segments[cell->source_index()])));
                        //printf("s: (%d, %d), (%d, %d)\n", x(low(segments[twinCell->source_index()])), y(low(segments[twinCell->source_index()])), x(high(segments[twinCell->source_index()])), y(high(segments[twinCell->source_index()])));
                        //printf("p1: (%d, %d)\n", x(p1), y(p1));
                        //printf("p2: (%d, %d)\n", x(p2), y(p2));

                        dist1 = dist(p1, segments[cell->source_index()]);
                        //double altdist1 = dist(p1, segments[twinCell->source_index()]);
                        //printf("** %d, %d: %f %f\n", x(p1), y(p1), dist1, altdist1);
                        dist2 = dist(p2, segments[cell->source_index()]);
                        //double altdist2 = dist(p2, segments[twinCell->source_index()]);
                        //printf("** %d, %d: %f %f\n", x(p2), y(p2), dist2, altdist2);
                    }

                    int z1 = -lround(dist1 / tan(angle/2));
                    int z2 = -lround(dist2 / tan(angle/2));
                    edges.emplace_back(Edge{{x(p1), y(p1), z1}, {x(p2), y(p2), z2}});
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
        }

        printf("g1\n");
        Scan::intersectEdges(edges, edges.begin(), edges.end());
        printf("g2\n");
        Scan::sortEdges(edges.begin(), edges.end());
        printf("g3\n");
        Scan::scan(
            edges.begin(), edges.end(),
            makeAccumulateWindingNumber([](ScanlineEdge& e){return e.edge->isGeometry; }),
            SetIsInGeometry{});
        edges.erase(
            remove_if(edges.begin(), edges.end(), [](const Edge& e) {return e.isGeometry || !e.isInGeometry; }),
            edges.end());

        if (edges.empty()) {
            convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, vector<vector<PointWithZ>>{});
            return;
        }

        printf("i\n");
        vector<Edge::Index> edgeIndexes;
        edgeIndexes.reserve(edges.size() * 2);
        for (auto& edge: edges) {
            edgeIndexes.emplace_back(edge.point1, false, &edge);
            edgeIndexes.emplace_back(edge.point2, true, &edge);
        }
        sort(edgeIndexes.begin(), edgeIndexes.end());
        for (auto& edgeIndex: edgeIndexes) {
            if (edgeIndex.isPoint2)
                edgeIndex.edge->index2 = &edgeIndex;
            else
                edgeIndex.edge->index1 = &edgeIndex;
        }

        printf("j\n");
        vector<Edge> reorderedEdges;
        reorderedEdges.reserve(edges.size());
        auto start = find_if(edgeIndexes.begin(), edgeIndexes.end(), [](const Edge::Index& index){return !index.point.z; });
        if (start == edgeIndexes.end())
            start = edgeIndexes.begin(); // !!!!
        start->edge->setTaken();
        PointWithZ p{start->point};
        if (start->isPoint2)
            swap(start->edge->point1, start->edge->point2);
        reorderedEdges.push_back(*start->edge);

        printf("k\n");
        while (reorderedEdges.size() < edges.size()) {
            auto it = lower_bound(edgeIndexes.begin(), edgeIndexes.end(), Edge::Index{p});
            auto closest = edgeIndexes.begin();
            double closestDist = numeric_limits<double>::max();

            for (auto it2 = it; it2 != edgeIndexes.end(); ++it2) {
                if (!closestDist || abs(it2->point.x - p.x) > closestDist)
                    break;
                if (!it2->taken) {
                    double dist = lenSquared(p - it2->point);
                    if (dist < closestDist) {
                        closest = it2;
                        closestDist = dist;
                    }
                }
            }
            for (auto it2 = it; it2 != edgeIndexes.begin(); --it2) {
                if (!closestDist || abs(it2[-1].point.x - p.x) > closestDist)
                    break;
                if (!it2[-1].taken) {
                    double dist = lenSquared(p - it2[-1].point);
                    if (dist < closestDist) {
                        closest = it2 - 1;
                        closestDist = dist;
                    }
                }
            }

            closest->edge->setTaken();
            p = closest->point;
            if (closest->isPoint2)
                swap(closest->edge->point1, closest->edge->point2);
            reorderedEdges.push_back(*closest->edge);
        }
        edges = move(reorderedEdges);

        printf("y\n");
        vector<vector<PointWithZ>> result;
        for (auto& e: edges) {
            vector<PointWithZ> path;
            path.emplace_back(e.point1.x, e.point1.y, 0);
            path.emplace_back(e.point1);
            path.emplace_back(e.point2);
            path.emplace_back(e.point2.x, e.point2.y, 0);
            result.emplace_back(move(path));
        }

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
