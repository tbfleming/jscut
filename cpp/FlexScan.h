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

template<typename Iterator>
using ScanlineEdgeFromIterator_t = typename std::remove_const<typename std::remove_reference<decltype(*std::declval<Iterator>())>::type>::type;

template<typename PolygonSet>
using PointFromPolygonSet_t = typename std::remove_const<typename std::remove_reference<decltype(*std::declval<PolygonSet>().begin()->begin())>::type>::type;

template<typename TPoint, template<typename Derived> class... Bases>
struct Edge : Bases<Edge<TPoint, Bases...>>... {
    using Point = TPoint;

    Point point1;
    Point point2;
    int deltaCount = 0;

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

template<typename Derived>
struct EdgeNext {
    Derived* next = nullptr;
};

template<typename TEdge, template<typename Derived> class... Bases>
struct ScanlineEdge : Bases<ScanlineEdge<TEdge, Bases...>>... {
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

template<typename Derived>
struct ScanlineEdgeExclude {
    bool exclude = false;
};

template<typename Derived>
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
        for (auto it = begin; it < end; ++it) {
            insertPoints(dest, it->begin(), it->end(), closed, allowZeroLength);
            break; // !!!!!!!!!!!!!!!!
        }
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
        edge.deltaCount = 1;
        if (x(edge.point1) > x(edge.point2) || x(edge.point1) == x(edge.point2) && y(edge.point1) > y(edge.point2)) {
            std::swap(edge.point1, edge.point2);
            edge.deltaCount *= -1;
        }
        if (x(edge.point1) == x(edge.point2))
            edge.deltaCount *= -1;
        dest.push_back(edge);
    }

    template<typename Container, typename It>
    static void intersectEdges(Container& dest, It begin, It end) {
        // pair sometimes has good uses. boost.polygon's authors should be banned from using pair for life.
        //                   <         <      p1,                 p2        >,          <property, deltaCount> >    I'm using property to hold index.
        std::vector<std::pair<std::pair<ScanlineBasePoint, ScanlineBasePoint>, std::pair<int, int>>> segments;
        size_t size = end - begin;
        segments.reserve(size);
        for (size_t i = 0; i < size; ++i) {
            segments.emplace_back(std::make_pair(
                std::make_pair(toScanlineBasePoint(begin[i].point1), toScanlineBasePoint(begin[i].point2)),
                std::make_pair(i, begin[i].deltaCount)));
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
            edge.deltaCount = segment.second.second;
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
    static void callCallback(Unit scanX, HighPrecision scanY, It begin, It end, const Callback0& callback0, const Callback&... callback)
    {
        //printf("   ...\n");
        callback0(scanX, scanY, begin, end);
        callCallback(scanX, scanY, begin, end, callback...);
    }

    template<typename It>
    static void callCallback(Unit scanX, HighPrecision scanY, It begin, It end)
    {
        //printf("   end\n");
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
                printf("add: (%d, %d), (%d, %d) %s\n",
                    x(edgeBegin->point1), y(edgeBegin->point1), x(edgeBegin->point2), y(edgeBegin->point2),
                    x(edgeBegin->point1) == x(edgeBegin->point2) ? "vertical" : "");
                ++edgeBegin;
            }

            for (auto& scanlineEdge: scanlineEdges) {
                auto& edge = *scanlineEdge.edge;
                scanlineEdge.yIntercept = evalAtXforY(scanX, edge);
                scanlineEdge.atEndpoint = scanX == x(edge.point1) || scanX == x(edge.point2);
            }

            sort(begin(scanlineEdges), end(scanlineEdges), lessScanlineEdge);

            printf("\nscan line:\n");
            for (auto& e: scanlineEdges) {
                printf("    atEndpoint: %d, atPoint1: %d?, atPoint2: %d? (%d, %d), (%d, %d) %s\n",
                    e.atEndpoint, e.atPoint1, e.atPoint2,
                    x(e.edge->point1), y(e.edge->point1), x(e.edge->point2), y(e.edge->point2),
                    x(e.edge->point1) == x(e.edge->point2) ? "vertical" : "");
            }

            auto scanlineEdgeIt = begin(scanlineEdges);
            while (scanlineEdgeIt != end(scanlineEdges)) {
                auto e = scanlineEdgeIt + 1;
                if (scanlineEdgeIt->atEndpoint)
                    while (e != end(scanlineEdges) && e->atEndpoint && e->yIntercept == scanlineEdgeIt->yIntercept)
                        ++e;
                for (auto it = scanlineEdgeIt; it < e; ++it) {
                    auto& edge = *it->edge;
                    if (x(it->edge->point1) != x(it->edge->point2)) {
                        it->atPoint1 = scanX == x(edge.point1);
                        it->atPoint2 = scanX == x(edge.point2);
                    }
                    //printf("atEndpoint: %d, atPoint1: %d, atPoint2: %d, yIntercept: %d, (%d, %d), (%d, %d) %s\n",
                    //    it->atEndpoint, it->atPoint1, it->atPoint2, int(it->yIntercept),
                    //    x(edge.point1), y(edge.point1), x(edge.point2), y(edge.point2),
                    //    x(edge.point1) == x(edge.point2) ? "vertical" : "");
                }
                //printf("call\n");
                callCallback(scanX, scanlineEdgeIt->yIntercept, scanlineEdgeIt, e, callback...);
                while (scanlineEdgeIt < e && (x(scanlineEdgeIt->edge->point1) != x(scanlineEdgeIt->edge->point2) || scanlineEdgeIt->atPoint2))
                    ++scanlineEdgeIt;
                for (auto it = scanlineEdgeIt; it < e; ++it) {
                    it->yIntercept = y(it->edge->point2);
                    it->atPoint1 = false;
                    it->atPoint2 = true;
                }
            }

            for (auto& e: scanlineEdges) {
                if (e.atPoint2) {
                    printf("drop atEndpoint: %d, atPoint1: %d, atPoint2: %d (%d, %d), (%d, %d) %s\n",
                        e.atEndpoint, e.atPoint1, e.atPoint2,
                        x(e.edge->point1), y(e.edge->point1), x(e.edge->point2), y(e.edge->point2),
                        x(e.edge->point1) == x(e.edge->point2) ? "vertical" : "");
                }
            }

            scanlineEdges.erase(
                std::remove_if(scanlineEdges.begin(), scanlineEdges.end(), [](const ScanlineEdge& e){return e.atPoint2; }),
                scanlineEdges.end());
            scanX = std::numeric_limits<Unit>::max();
            for (auto& e: scanlineEdges)
                scanX = std::min(scanX, x(e.edge->point2));

            //printf("scanX           %d\n", scanX);

            if (edgeBegin != edgeEnd)
                scanX = std::min(scanX, x(edgeBegin->point1));

            //printf("scanX           %d\n", scanX);
            //printf("scanlineEdges   %d\n", scanlineEdges.size());
            //printf("edges left      %d\n\n", edgeEnd-edgeBegin);
        }
    }
}; // Scan

struct ExcludeOppositeEdges {
    template<typename Unit, typename HighPrecision, typename It>
    void operator()(Unit x, HighPrecision y, It begin, It end) const
    {
        using ScanlineEdge = ScanlineEdgeFromIterator_t<It>;
        using Scan = Scan<ScanlineEdge>;

        //printf("ExcludeOppositeEdges %d\n", end-begin);
        while (true) {
            while (begin != end && begin->exclude)
                ++begin;
            if (begin == end)
                break;
            for (auto otherIt = begin+1; otherIt != end; ++otherIt) {
                if (!otherIt->exclude && begin->edge->deltaCount == -otherIt->edge->deltaCount) {
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
        //printf("~ExcludeOppositeEdges\n");
    }
};

struct AccumulateCount {
    mutable int currentCount = 0;

    template<typename Unit, typename HighPrecision, typename It>
    void operator()(Unit scanX, HighPrecision scanY, It begin, It end) const
    {
        using ScanlineEdge = ScanlineEdgeFromIterator_t<It>;
        using Scan = Scan<ScanlineEdge>;

        printf("AccumulateCount %d\n", end-begin);
        while (begin != end) {
            // prep left-side vertical
            for (auto it = begin; it != end && x(it->edge->point1) == x(it->edge->point2); ++it) {
                if (!it->exclude && it->atPoint1 && it->edge->deltaCount > 0) {
                    currentCount -= it->edge->deltaCount;
                    printf("prep: @(%d, %d) (%d, %d) (%d, %d) @1=%d @2=%d deltaCount=%d\n",
                        it->atPoint1, it->atPoint2,
                        x(it->edge->point1), y(it->edge->point1),
                        x(it->edge->point2), y(it->edge->point2),
                        it->atPoint1, it->atPoint2,
                        it->edge->deltaCount);
                }
            }

            // vertical
            for (auto it = begin; it != end && x(it->edge->point1) == x(it->edge->point2); ++it) {
                if (it->atPoint1) {
                    it->countBefore = currentCount;
                    if (!it->exclude)
                        currentCount += it->edge->deltaCount;
                    it->countAfter = currentCount;
                }
                printf("[%d -> %d]: @(%d, %d) (%d, %d) (%d, %d) @1=%d @2=%d deltaCount=%d\n",
                    it->countBefore, it->countAfter, it->atPoint1, it->atPoint2,
                    x(it->edge->point1), y(it->edge->point1),
                    x(it->edge->point2), y(it->edge->point2),
                    it->atPoint1, it->atPoint2,
                    it->edge->deltaCount);
            }

            // undo right-side vertical
            for (auto it = begin; it != end && x(it->edge->point1) == x(it->edge->point2); ++it) {
                if (!it->exclude && it->atPoint1 && it->edge->deltaCount < 0) {
                    currentCount -= it->edge->deltaCount;
                    printf("undo: @(%d, %d) (%d, %d) (%d, %d) @1=%d @2=%d deltaCount=%d\n",
                        it->atPoint1, it->atPoint2,
                        x(it->edge->point1), y(it->edge->point1),
                        x(it->edge->point2), y(it->edge->point2),
                        it->atPoint1, it->atPoint2,
                        it->edge->deltaCount);
                }
            }

            // finished with vertical
            while (begin != end && x(begin->edge->point1) == x(begin->edge->point2))
                ++begin;

            // non-vertical
            while (begin != end && x(begin->edge->point1) != x(begin->edge->point2)) {
                begin->countBefore = currentCount;
                if (!begin->exclude)
                    currentCount += begin->edge->deltaCount;
                begin->countAfter = currentCount;
                printf(" %d -> %d : @(%d, %d) (%d, %d) (%d, %d) @1=%d @2=%d deltaCount=%d\n",
                    begin->countBefore, begin->countAfter, begin->atPoint1, begin->atPoint2,
                    x(begin->edge->point1), y(begin->edge->point1),
                    x(begin->edge->point2), y(begin->edge->point2),
                    begin->atPoint1, begin->atPoint2,
                    begin->edge->deltaCount);
                ++begin;
            }
        }

        printf("~AccumulateCount\n");
    }
};

template<typename ScanlineEdge, typename Condition>
struct SetNext {
public:
    Condition condition;

    SetNext(Condition condition) :
        condition(condition)
    {
    }

    SetNext(const SetNext&) = default;
    SetNext(SetNext&&) = default;
    SetNext& operator=(const SetNext&) = default;
    SetNext& operator=(SetNext&&) = default;

private:
    mutable std::vector<ScanlineEdge*> candidates;

    static int getAdjustedDeltaCount(const ScanlineEdge& e) {
        int i = e.edge->deltaCount;
        if (e.atPoint2)
            i = -i;
        if (x(e.edge->point1) == x(e.edge->point2))
            i = -i;
        return i;
    }

public:
    template<typename Unit, typename HighPrecision, typename It>
    void operator()(Unit scanX, HighPrecision scanY, It begin, It end) const
    {
        using Scan = Scan<ScanlineEdge>;

        //printf("SetNext %d\n", end-begin);
        candidates.clear();
        candidates.reserve(end-begin);
        for (auto it = begin; it < end; ++it)
            if (it->atEndpoint && it->edge->deltaCount && condition(*it))
                candidates.push_back(&*it);

        auto b = candidates.begin();
        auto e = candidates.end();
        while (b != e) {
            int deltaCount = getAdjustedDeltaCount(**b);
            auto otherIt = e-1;
            while (otherIt != b && getAdjustedDeltaCount(**otherIt) != -deltaCount)
                --otherIt;
            if (otherIt != b) {
                if (deltaCount < 0)
                    (*b)->edge->next = (*otherIt)->edge;
                else
                    (*otherIt)->edge->next = (*b)->edge;
                --e;
                candidates.erase(otherIt);
            }
            ++b;
        }
        //printf("~SetNext\n");
    }
};

template<typename ScanlineEdge, typename Condition>
SetNext<ScanlineEdge, Condition> makeSetNext(Condition condition) {
    return{condition};
}

template<typename PolygonSet, typename It>
void fillPolygonSetFromEdges(PolygonSet& ps, It begin, It end) {
    while (begin != end) {
        if (begin->next) {
            //printf("\n");
            ps.emplace_back();
            auto& polygon = ps.back();
            auto* edge = &*begin;
            while (true) {
                //printf("%d: %d, %d -> %d, %d deltaCount=%d\n", edge-&*begin, x(edge->point1), y(edge->point1), x(edge->point2), y(edge->point2), edge->deltaCount);
                auto* next = edge->next;
                edge->next = nullptr;
                edge = next;
                if (edge) {
                    int i = edge->deltaCount;
                    if (x(edge->point1) == x(edge->point2))
                        i = -i;
                    if (i > 0)
                        polygon.emplace_back(edge->point1);
                    else
                        polygon.emplace_back(edge->point2);
                }
                else
                    break;
            }
        }
        ++begin;
    }
}

template<typename PolygonSet>
void cleanPolygonSet(PolygonSet& ps) {
    using Point = PointFromPolygonSet_t<PolygonSet>;
    using Edge = Edge<Point, EdgeNext>;
    using ScanlineEdge = ScanlineEdge<Edge, ScanlineEdgeExclude, ScanlineEdgeCount>;
    using Scan = Scan<ScanlineEdge>;

    std::vector<Edge> edges;
    Scan::insertPolygons(edges, ps.begin(), ps.end());
    //Scan::insertPoints(edges, std::vector<Point>{{0, -100000}, {100000, -100000}, {100000, 0}, {0, 0}});
    //Scan::insertPoints(edges, std::vector<Point>{{0, -100000}, {100000, -100000}, {100000, 0}, {0, 0}});
    //Scan::insertPoints(edges, std::vector<Point>{{0, -100000}, {0, 0}});
    //Scan::intersectEdges(edges, edges.begin(), edges.end());
    Scan::sortEdges(edges.begin(), edges.end());
    Scan::scan(
        edges.begin(), edges.end(),
        //ExcludeOppositeEdges{},
        AccumulateCount{},
        makeSetNext<ScanlineEdge>([](ScanlineEdge& e){return !e.exclude && e.countBefore == 0 && e.countAfter == 1 || e.countBefore == 1 && e.countAfter == 0; }));

    ps.clear();
    fillPolygonSetFromEdges(ps, edges.begin(), edges.end());

    for (auto& poly: ps) {
        printf("\n");
        for (auto& point: poly)
            printf("%d, %d\n", x(point), y(point));
    }
}

} // namespace FlexScan
