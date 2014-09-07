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
    bool isGeometry = false;
    bool isInGeometry = false;
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

extern "C" void vEngrave(
    double** paths, int numPaths, int* pathSizes, double cutterDia,
    double**& resultPaths, int& resultNumPaths, int*& resultPathSizes
    )
{
    try {
        using Edge = Edge<Point, VoronoiEdge>;
        using ScanlineEdge = ScanlineEdge<Edge, ScanlineEdgeWindingNumber>;
        using Scan = Scan<ScanlineEdge>;

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

        bp::voronoi_diagram<double> vd;
        bp::default_voronoi_builder builder;
        for (auto& segment: segments)
            builder.insert_segment(x(low(segment)), y(low(segment)), x(high(segment)), y(high(segment)));
        builder.construct(&vd);

        vector<Edge> edges;
        Scan::insertPolygons(edges, geometry.begin(), geometry.end(), true);
        for (size_t i = 0; i < edges.size(); ++i)
            edges[i].isGeometry = true;

        for (auto& edge: vd.edges())
            edge.color(0);
        int n = 0;
        for (auto& edge: vd.edges()) {
            if (edge.is_primary() && edge.is_finite() && !(edge.color()&1)) {
                auto cell = edge.cell();
                auto twinCell = edge.twin()->cell();

                if (edge.is_linear()) {
                    edge.color(1);
                    edge.twin()->color(1);
                    Point p1{lround(edge.vertex0()->x()), lround(edge.vertex0()->y())};
                    Point p2{lround(edge.vertex1()->x()), lround(edge.vertex1()->y())};
                    auto segment1 = segments[cell->source_index()];
                    auto segment2 = segments[twinCell->source_index()];
                    bool keep = true;
                    getCorner(segment1, segment2, [&keep](Point center, Point e1, Point e2) {
                        double c = dot(e1-center, e2-center) / euclidean_distance(e1, center) / euclidean_distance(e2, center);
                        if (c <= cos(95/2/M_PI))
                            keep = false;
                    });
                    if (keep)
                        edges.emplace_back(Edge{p1, p2});
                }
                else if (edge.is_curved()) {
                    ++n;
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

                    // ...
                }
            }
        }
        printf("n=%d\n", n);

        Scan::intersectEdges(edges, edges.begin(), edges.end());
        Scan::sortEdges(edges.begin(), edges.end());
        Scan::scan(
            edges.begin(), edges.end(),
            makeAccumulateWindingNumber([](ScanlineEdge& e){return e.edge->isGeometry; }),
            SetIsInGeometry{});

        PolygonSet result;
        for (auto& e: edges)
            if (!e.isGeometry && e.isInGeometry)
                result.emplace_back(Polygon{e.point1, e.point2});

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
