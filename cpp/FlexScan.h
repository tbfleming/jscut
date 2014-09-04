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

#pragma once

#include <boost/polygon/polygon.hpp>
#include <algorithm>
#include <type_traits>

namespace FlexScan {

namespace bp = boost::polygon;

template<typename T, typename Less0, typename... TLess>
bool chainLess(const T& a, const T& b, const Less0& less0, const TLess&... less)
{
    return less0(a, b) || !less0(b, a) && chainLess(a, b, less...);
}

template<typename T>
bool chainLess(const T& a, const T& b)
{
    return false;
}

template<typename TPoint, typename... Bases>
struct Edge: Bases... {
    using Point = TPoint;

    Point point1;
    Point point2;
    int count = 0;

    Edge(Point point1, Point point2) :
        point1(point1),
        point2(point2)
    {
    }

    Edge() = default;
    Edge(const Edge&) = default;
    Edge(Edge&&) = default;
    Edge& operator=(const Edge&) = default;
    Edge& operator=(Edge&&) = default;
};

template<typename TEdge, typename... Bases>
struct ScanlineEdge : Bases... {
    using Edge = TEdge;
    using Point = typename Edge::Point;
    using Unit = typename bp::point_traits<Point>::coordinate_type;
    using HighPrecision = typename bp::high_precision_type<Unit>::type;

    Edge* edge;
    HighPrecision yIntercept = 0;
    bool atEndpoint = false;
    bool atPoint1 = false;
    bool atPoint2 = false;

    explicit ScanlineEdge(Edge* edge = nullptr) :
        edge(edge)
    {
    }

    ScanlineEdge(const ScanlineEdge&) = default;
    ScanlineEdge(ScanlineEdge&&) = default;
    ScanlineEdge& operator=(const ScanlineEdge&) = default;
    ScanlineEdge& operator=(ScanlineEdge&&) = default;
};

struct ScanlineEdgeExclude {
    bool exclude = false;
};

struct ScanlineEdgeCount {
    int countBefore = 0;
    int countAfter = 0;
};

template<typename TScanlineEdge>
struct Scan {
    using ScanlineEdge = TScanlineEdge;
    using Edge = typename ScanlineEdge::Edge;
    using Point = typename ScanlineEdge::Point;
    using Unit = typename ScanlineEdge::Unit;
    using HighPrecision = typename ScanlineEdge::HighPrecision;
    using ScanlineBase = bp::scanline_base<Unit>;
    using ScanlineBasePoint = typename ScanlineBase::Point;

    static ScanlineBasePoint toScanlineBasePoint(Point p)
    {
        return{x(p), y(p)};
    }

    static bool dx(const Edge& e)
    {
        return x(e.point2) - x(e.point1);
    }

    static bool dy(const Edge& e)
    {
        return y(e.point2) - y(e.point1);
    }

    struct LessSlope {
        bool operator()(const Edge& e1, const Edge& e2) const
        {
            return ScanlineBase::less_slope(dx(e1), dy(e1), dx(e2), dy(e2));
        }

        bool operator()(const ScanlineEdge& e1, const ScanlineEdge& e2) const
        {
            return (*this)(*e1.edge, *e2.edge);
        }
    };

    static HighPrecision evalAtXforY(Unit x, const Edge& edge)
    {
        return ScanlineBase::evalAtXforY(x, toScanlineBasePoint(edge.point1), toScanlineBasePoint(edge.point2));
    }

    static bool lessEdge(const Edge& e1, const Edge& e2)
    {
        return x(e1.point1) < x(e2.point1);
    }

    template<typename Container, typename It>
    static void insertPolygons(Container& dest, It begin, It end, bool closed = true, bool allowZeroLength = false) {
        for (auto it = begin; it < end; ++it)
            insertPoints(dest, it->begin(), it->end(), closed, allowZeroLength);
    }

    template<typename Container, typename SrcContainer>
    static void insertPoints(Container& dest, const SrcContainer& src, bool closed = true, bool allowZeroLength = false) {
        insertPoints(dest, src.begin(), src.end(), closed, allowZeroLength);
    }

    template<typename Container, typename It>
    static void insertPoints(Container& dest, It begin, It end, bool closed = true, bool allowZeroLength = false) {
        size_t size = end - begin;
        for (size_t i = 0; i < size; ++i) {
            const Point* p1 = &begin[i];
            const Point* p2;
            if (i+1 < size)
                p2 = &begin[i+1];
            else if (closed)
                p2 = &begin[0];
            else
                break;
            insertEdge(dest, {*p1, *p2}, allowZeroLength);
        }
    };

    template<typename Container>
    static void insertEdge(Container& dest, Edge edge, bool allowZeroLength = false) {
        if (!allowZeroLength && toScanlineBasePoint(edge.point1) == toScanlineBasePoint(edge.point2))
            return;
        edge.count = 1;
        if (x(edge.point1) > x(edge.point2) || x(edge.point1) == x(edge.point2) && y(edge.point1) > y(edge.point2)) {
            std::swap(edge.point1, edge.point2);
            edge.count *= -1;
        }
        if (x(edge.point1) == x(edge.point2))
            edge.count *= -1;
        dest.push_back(edge);
    }

    template<typename Container, typename It>
    static void intersectEdges(Container& dest, It begin, It end) {
        // pair sometimes has good uses. boost.polygon's authors should be banned from using pair for life.
        //                   <         <      p1,                 p2        >,          <property, count> >    I'm using property to hold index.
        std::vector<std::pair<std::pair<ScanlineBasePoint, ScanlineBasePoint>, std::pair<int, int>>> segments;
        size_t size = end - begin;
        segments.reserve(size);
        for (size_t i = 0; i < size; ++i) {
            segments.emplace_back(std::make_pair(
                std::make_pair(toScanlineBasePoint(begin[i].point1), toScanlineBasePoint(begin[i].point2)),
                std::make_pair(i, begin[i].count)));
        }

        std::vector<std::pair<std::pair<ScanlineBasePoint, ScanlineBasePoint>, std::pair<int, int>> > intersected;
        intersected.reserve(size);
        bp::line_intersection<Unit>::validate_scan(intersected, segments.begin(), segments.end());

        Container result;
        result.reserve(intersected.size());
        for (auto& segment: intersected) {
            auto edge = begin[segment.second.first];
            edge.point1 = segment.first.first;
            edge.point2 = segment.first.second;
            edge.count = segment.second.second;
            result.push_back(edge);
        }

        dest = move(result);
    }

    template<typename EdgeIt>
    static void sortEdges(EdgeIt begin, EdgeIt end) {
        std::sort(begin, end, lessEdge);
    }

    static bool lessScanlineEdge(const ScanlineEdge& e1, const ScanlineEdge& e2)
    {
        return chainLess(
            e1, e2,
            [](const ScanlineEdge& e1, const ScanlineEdge& e2){return e1.yIntercept < e2.yIntercept; },
            [](const ScanlineEdge& e1, const ScanlineEdge& e2){return e1.atEndpoint < e2.atEndpoint; },
            LessSlope{});
    }

    template<typename It, typename Callback0, typename... Callback>
    static void callCallback(Unit x, HighPrecision y, It begin, It end, const Callback0& callback0, const Callback&... callback)
    {
        printf("   ...\n");
        callback0(x, y, begin, end);
        callCallback(x, y, begin, end, callback...);
    }

    template<typename It>
    static void callCallback(Unit x, HighPrecision y, It begin, It end)
    {
        printf("   end\n");
    }

    template<typename EdgeIt, typename... Callback>
    static void scan(
        EdgeIt edgeBegin,
        EdgeIt edgeEnd,
        Callback... callback)
    {
        if (edgeBegin == edgeEnd)
            return;

        Unit scanX = x(edgeBegin->point1);
        std::vector<ScanlineEdge> scanlineEdges;
        while (edgeBegin != edgeEnd || !scanlineEdges.empty()) {
            while (edgeBegin != edgeEnd && x(edgeBegin->point1) == scanX) {
                ScanlineEdge sledge{&*edgeBegin};
                sledge.atPoint1 = true;
                scanlineEdges.push_back(sledge);
                ++edgeBegin;
            }

            for (auto& scanlineEdge: scanlineEdges) {
                auto& edge = *scanlineEdge.edge;
                scanlineEdge.yIntercept = evalAtXforY(scanX, edge);
                scanlineEdge.atEndpoint = scanX == x(edge.point1) || scanX == x(edge.point1);
            }

            sort(begin(scanlineEdges), end(scanlineEdges), lessScanlineEdge);

            auto scanlineEdgeIt = begin(scanlineEdges);
            while (scanlineEdgeIt != end(scanlineEdges)) {
                auto e = scanlineEdgeIt + 1;
                if (scanlineEdgeIt->atEndpoint)
                    while (e != end(scanlineEdges) && e->atEndpoint && e->yIntercept == scanlineEdgeIt->yIntercept)
                        ++e;
                for (auto it = scanlineEdgeIt; it < e; ++it) {
                    auto& edge = *it->edge;
                    it->atPoint1 = scanX == x(edge.point1);
                    it->atPoint2 = scanX == x(edge.point2);
                }
                printf("call\n");
                callCallback(scanX, scanlineEdgeIt->yIntercept, scanlineEdgeIt, e, callback...);
                scanlineEdgeIt = e;
            }

            scanlineEdges.erase(
                std::remove_if(scanlineEdges.begin(), scanlineEdges.end(), [](const ScanlineEdge& e){return e.atPoint2; }),
                scanlineEdges.end());
            scanX = std::numeric_limits<Unit>::max();
            for (auto& e: scanlineEdges)
                scanX = std::min(scanX, x(e.edge->point2));

            printf("scanX           %d\n", scanX);

            if (edgeBegin != edgeEnd)
                scanX = std::min(scanX, x(edgeBegin->point1));

            printf("scanX           %d\n", scanX);
            printf("scanlineEdges   %d\n", scanlineEdges.size());
            printf("edges left      %d\n\n", edgeEnd-edgeBegin);
        }
    }
}; // Scan

struct ExcludeOppositeEdges {
    template<typename Unit, typename HighPrecision, typename It>
    void operator()(Unit x, HighPrecision y, It begin, It end) const
    {
        using ScanlineEdge = typename std::remove_const<typename std::remove_reference<decltype(*begin)>::type>::type;
        using Scan = Scan<ScanlineEdge>;

        printf("ExcludeOppositeEdges %d\n", end-begin);
        while (true) {
            while (begin != end && begin->exclude)
                ++begin;
            if (begin == end)
                break;
            for (auto otherIt = begin+1; otherIt != end; ++otherIt) {
                if (!otherIt->exclude && begin->edge->count == -otherIt->edge->count) {
                    // Only use X,Y for comparison
                    auto p1 = Scan::toScanlineBasePoint(begin->edge->point1);
                    auto p2 = Scan::toScanlineBasePoint(begin->edge->point2);
                    auto op1 = Scan::toScanlineBasePoint(otherIt->edge->point1);
                    auto op2 = Scan::toScanlineBasePoint(otherIt->edge->point2);
                    if (p1 == op1 && p2 == op2) {
                        begin->exclude = true;
                        otherIt->exclude = true;
                        printf("   excluded opposites\n");
                        break;
                    }
                }
            }
            ++begin;
        }
        printf("~ExcludeOppositeEdges\n");
    }
};

struct FillCount {
    mutable int currentCount = 0;

    template<typename Unit, typename HighPrecision, typename It>
    void operator()(Unit xIn, HighPrecision yIn, It begin, It end) const
    {
        using ScanlineEdge = typename std::remove_const<typename std::remove_reference<decltype(*begin)>::type>::type;
        using Scan = Scan<ScanlineEdge>;

        printf("FillCount %d\n", end-begin);
        while (begin != end) {
            if (x(begin->edge->point1) == x(begin->edge->point2)) {
                if (begin->atPoint1) {
                    begin->countBefore = currentCount - begin->edge->count;
                    begin->countAfter = currentCount;
                }
                printf("[%d -> %d]: (%d, %d) (%d, %d) %d\n", begin->countBefore, begin->countAfter, x(begin->edge->point1), y(begin->edge->point1), x(begin->edge->point2), y(begin->edge->point2), begin->edge->count);
            }
            else {
                begin->countBefore = currentCount;
                if (!begin->exclude)
                    currentCount += begin->edge->count;
                begin->countAfter = currentCount;
                printf(" %d -> %d : (%d, %d) (%d, %d) %d\n", begin->countBefore, begin->countAfter, x(begin->edge->point1), y(begin->edge->point1), x(begin->edge->point2), y(begin->edge->point2), begin->edge->count);
            }
            ++begin;
        }
        printf("~FillCount\n");
    }
};

template<typename PolygonSet>
void cleanPolygonSet(PolygonSet& ps) {
    using Point = typename std::remove_const<typename std::remove_reference<decltype(*ps.begin()->begin())>::type>::type;
    using Edge = Edge<Point>;
    using ScanlineEdge = ScanlineEdge<Edge, ScanlineEdgeExclude, ScanlineEdgeCount>;
    using Scan = Scan<ScanlineEdge>;

    std::vector<Edge> edges;
    //Scan::insertPolygons(edges, ps.begin(), ps.end());
    Scan::insertPoints(edges, std::vector<Point>{{0, -100000}, {100000, -100000}, {100000, 0}, {0, 0}});
    //Scan::insertPoints(edges, std::vector<Point>{{0, -100000}, {0, 0}});
    Scan::intersectEdges(edges, edges.begin(), edges.end());
    Scan::sortEdges(edges.begin(), edges.end());
    Scan::scan(
        edges.begin(), edges.end(),
        ExcludeOppositeEdges{},
        FillCount{});
}

} // namespace FlexScan
