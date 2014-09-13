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

// Combine less comparitors
template<typename T, typename Less0, typename... TLess>
bool combineLess(const T& a, const T& b, const Less0& less0, const TLess&... less)
{
    return less0(a, b) || !less0(b, a) && combineLess(a, b, less...);
}

template<typename T>
bool combineLess(const T& a, const T& b)
{
    return false;
}

template<typename Unit>
using ManhattanAreaFromUnit_t = typename bp::coordinate_traits<Unit>::manhattan_area_type;

template<typename Point>
using UnitFromPoint_t = typename bp::point_traits<Point>::coordinate_type;

template<typename Point>
using ManhattanAreaFromPoint_t = ManhattanAreaFromUnit_t<UnitFromPoint_t<Point>>;

template<typename Polygon>
using PointFromPolygon_t = typename std::remove_const<typename std::remove_reference<decltype(*std::declval<Polygon>().begin())>::type>::type;

template<typename Polygon>
using UnitFromPolygon_t = UnitFromPoint_t<PointFromPolygon_t<Polygon>>;

template<typename PolygonSet>
using PolygonFromPolygonSet_t = typename std::remove_const<typename std::remove_reference<decltype(*std::declval<PolygonSet>().begin())>::type>::type;

template<typename PolygonSet>
using PointFromPolygonSet_t = PointFromPolygon_t<PolygonFromPolygonSet_t<PolygonSet>>;

template<typename PolygonSet>
using UnitFromPolygonSet_t = UnitFromPolygon_t<PolygonFromPolygonSet_t<PolygonSet>>;

template<typename Iterator>
using ObjectFromIterator_t = typename std::remove_const<typename std::remove_reference<decltype(*std::declval<Iterator>())>::type>::type;

static double deltaAngleForError(double e, double r) {
    e = std::min(r/2, e);
    return acos(2*(1-e/r)*(1-e/r)-1);
}

template<typename Point>
static ManhattanAreaFromPoint_t<Point> dot(const Point& a, const Point& b) {
    return ManhattanAreaFromPoint_t<Point>{x(a)}*x(b) + ManhattanAreaFromPoint_t<Point>{y(a)}*y(b);
}

template<typename TPoint, template<typename Derived> class... Bases>
struct Edge : Bases<Edge<TPoint, Bases...>>... {
    using Point = TPoint;

    // Scan must hit point1 at or before point2.
    // x(point1) < x(point2) || x(point1) == x(point2) && y(point1) <= y(point2).
    Point point1;
    Point point2;

    // How much to change the winding number when crossing edge in scan order
    int deltaWindingNumber = 0;

    // Constructor reorders points and adjusts deltaWindingNumber if clean == true
    Edge(Point point1, Point point2, bool clean) :
        point1(point1),
        point2(point2),
        deltaWindingNumber(1)
    {
        if (clean) {
            if (x(this->point1) > x(this->point2) || x(this->point1) == x(this->point2) && y(this->point1) > y(this->point2)) {
                std::swap(this->point1, this->point2);
                this->deltaWindingNumber *= -1;
            }
            if (x(this->point1) == x(this->point2))
                this->deltaWindingNumber *= -1;
        }
    }

    Edge() = default;
    Edge(const Edge&) = default;
    Edge(Edge&&) = default;
    Edge& operator=(const Edge&) = default;
    Edge& operator=(Edge&&) = default;
};

// Are point1 and point2 swapped from their original order?
template<typename Edge>
bool swapped(const Edge& edge) {
    int i = edge.deltaWindingNumber;
    if (x(edge.point1) == x(edge.point2))
        i = -i;
    return i < 0;
}

template<typename Derived>
struct EdgeId {
    int id = 0;
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
struct ScanlineEdgeWindingNumber {
    int windingNumberBefore = 0;
    int windingNumberAfter = 0;
};

template<typename Derived>
struct ScanlineEdgeWindingNumber2 {
    int windingNumberBefore2 = 0;
    int windingNumberAfter2 = 0;
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

    // Use 1: talk to Boost.Polygon
    // Use 2: ignore extra data in Point when comparing
    static ScanlineBasePoint toScanlineBasePoint(Point p)
    {
        return{x(p), y(p)};
    }

    static Unit dx(const Edge& e)
    {
        return x(e.point2) - x(e.point1);
    }

    static Unit dy(const Edge& e)
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

    static HighPrecision getYIntercept(Unit x, const Edge& edge)
    {
        return ScanlineBase::evalAtXforY(x, toScanlineBasePoint(edge.point1), toScanlineBasePoint(edge.point2));
    }

    // Comparitor for sorting edges into scan order. Y values don't matter.
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
        using InputPoint = ObjectFromIterator_t<It>;
        size_t size = end - begin;
        for (size_t i = 0; i < size; ++i) {
            const InputPoint* p1 = &begin[i];
            const InputPoint* p2;
            if (i+1 < size)
                p2 = &begin[i+1];
            else if (closed)
                p2 = &begin[0];
            else
                break;
            if (allowZeroLength || toScanlineBasePoint(*p1) != toScanlineBasePoint(*p2))
                dest.push_back({*p1, *p2, true});
        }
    };

    // Split edges at intersections
    template<typename Container, typename It>
    static void intersectEdges(Container& dest, It begin, It end) {
        // boost.polygon's authors should be banned from using pair for life.
        //                   <         <      p1,                 p2        >,     <property, deltaWindingNumber> >    I'm using property to hold index.
        std::vector<std::pair<std::pair<ScanlineBasePoint, ScanlineBasePoint>, std::pair<int, int>>> segments;
        size_t size = end - begin;
        segments.reserve(size);
        for (size_t i = 0; i < size; ++i) {
            segments.emplace_back(std::make_pair(
                std::make_pair(toScanlineBasePoint(begin[i].point1), toScanlineBasePoint(begin[i].point2)),
                std::make_pair(i, begin[i].deltaWindingNumber)));
        }

        std::vector<std::pair<std::pair<ScanlineBasePoint, ScanlineBasePoint>, std::pair<int, int>> > intersected;
        intersected.reserve(size);
        bp::line_intersection<Unit>::validate_scan(intersected, segments.begin(), segments.end());

        Container result;
        result.reserve(intersected.size());
        for (auto& segment: intersected) {
            auto edge = begin[segment.second.first];
            x(edge.point1, x(segment.first.first));
            y(edge.point1, y(segment.first.first));
            x(edge.point2, x(segment.first.second));
            y(edge.point2, y(segment.first.second));
            edge.deltaWindingNumber = segment.second.second;
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
        return combineLess(
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

    // Scan edges. Edges must not have any intersections and must already be sorted using lessEdge.
    template<typename EdgeIt, typename... Callback>
    static void scan(
        EdgeIt edgeBegin,
        EdgeIt edgeEnd,
        Callback... callback)
    {
        const bool debug = false;
        if (edgeBegin == edgeEnd)
            return;

        Unit scanX = x(edgeBegin->point1);
        std::vector<ScanlineEdge> scanlineEdges;
        while (edgeBegin != edgeEnd || !scanlineEdges.empty()) {
            while (edgeBegin != edgeEnd && x(edgeBegin->point1) == scanX) {
                ScanlineEdge sledge{&*edgeBegin};
                sledge.atPoint1 = true;
                scanlineEdges.push_back(sledge);
                if (debug) {
                    printf("add: (%d, %d), (%d, %d) %s\n",
                        x(edgeBegin->point1), y(edgeBegin->point1), x(edgeBegin->point2), y(edgeBegin->point2),
                        x(edgeBegin->point1) == x(edgeBegin->point2) ? "vertical" : "");
                }
                ++edgeBegin;
            }

            for (auto& scanlineEdge: scanlineEdges) {
                auto& edge = *scanlineEdge.edge;
                scanlineEdge.yIntercept = getYIntercept(scanX, edge);
                scanlineEdge.atEndpoint = scanX == x(edge.point1) || scanX == x(edge.point2);
            }

            sort(begin(scanlineEdges), end(scanlineEdges), lessScanlineEdge);

            if (debug) {
                printf("\nscan line:\n");
                for (auto& e: scanlineEdges) {
                    printf("    atEndpoint: %d, atPoint1: %d?, atPoint2: %d? (%d, %d), (%d, %d) %s\n",
                        e.atEndpoint, e.atPoint1, e.atPoint2,
                        x(e.edge->point1), y(e.edge->point1), x(e.edge->point2), y(e.edge->point2),
                        x(e.edge->point1) == x(e.edge->point2) ? "vertical" : "");
                }
                for (size_t i = 0; i < scanlineEdges.size()-1; ++i) {
                    printf("\n%d < %d?  %d\n", i, i+1, LessSlope{}(scanlineEdges[i], scanlineEdges[i+1]));
                    printf("%d < %d?  %d\n", i+1, i, LessSlope{}(scanlineEdges[i+1], scanlineEdges[i]));
                }
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

            if (debug) {
                for (auto& e: scanlineEdges) {
                    if (e.atPoint2) {
                        printf("drop atEndpoint: %d, atPoint1: %d, atPoint2: %d (%d, %d), (%d, %d) %s\n",
                            e.atEndpoint, e.atPoint1, e.atPoint2,
                            x(e.edge->point1), y(e.edge->point1), x(e.edge->point2), y(e.edge->point2),
                            x(e.edge->point1) == x(e.edge->point2) ? "vertical" : "");
                    }
                }
            }

            scanlineEdges.erase(
                std::remove_if(scanlineEdges.begin(), scanlineEdges.end(), [](const ScanlineEdge& e){return e.atPoint2; }),
                scanlineEdges.end());

            scanX = std::numeric_limits<Unit>::max();
            for (auto& e: scanlineEdges)
                scanX = std::min(scanX, x(e.edge->point2));
            if (edgeBegin != edgeEnd)
                scanX = std::min(scanX, x(edgeBegin->point1));
        }
    }
}; // Scan

struct ExcludeOppositeEdges {
    template<typename Unit, typename HighPrecision, typename It>
    void operator()(Unit scanX, HighPrecision scanY, It begin, It end) const
    {
        using ScanlineEdge = ObjectFromIterator_t<It>;
        using Scan = Scan<ScanlineEdge>;

        //printf("ExcludeOppositeEdges %d\n", end-begin);
        while (true) {
            while (begin != end && begin->exclude)
                ++begin;
            if (begin == end)
                break;
            for (auto otherIt = begin+1; otherIt != end; ++otherIt) {
                if (!otherIt->exclude && begin->edge->deltaWindingNumber == -otherIt->edge->deltaWindingNumber) {
                    // Only use X,Y for comparison
                    auto p1 = Scan::toScanlineBasePoint(begin->edge->point1);
                    auto p2 = Scan::toScanlineBasePoint(begin->edge->point2);
                    auto op1 = Scan::toScanlineBasePoint(otherIt->edge->point1);
                    auto op2 = Scan::toScanlineBasePoint(otherIt->edge->point2);
                    if (p1 == op1 && p2 == op2) {
                        begin->exclude = true;
                        otherIt->exclude = true;
                        //printf("   excluded opposites: (%d, %d) (%d, %d)\n", x(begin->edge->point1), y(begin->edge->point1), x(begin->edge->point2), y(begin->edge->point2));
                        break;
                    }
                }
            }
            ++begin;
        }
        //printf("~ExcludeOppositeEdges\n");
    }
};

struct NotExcluded {
    template<typename ScanlineEdge>
    bool operator()(ScanlineEdge& e) const {
        return !e.exclude;
    }
};

template<typename WindingNumberBefore, typename WindingNumberAfter, typename Condition>
struct AccumulateWindingNumber {
    WindingNumberBefore windingNumberBefore;
    WindingNumberAfter windingNumberAfter;
    Condition condition;
    mutable int leftWindingNumber = 0;
    mutable int rightWindingNumber = 0;

    AccumulateWindingNumber(WindingNumberBefore windingNumberBefore, WindingNumberAfter windingNumberAfter, Condition condition) :
        windingNumberBefore(windingNumberBefore),
        windingNumberAfter(windingNumberAfter),
        condition(condition)
    {
    }

    template<typename Unit, typename HighPrecision, typename It>
    void operator()(Unit scanX, HighPrecision scanY, It begin, It end) const
    {
        const bool debug = false;

        if (debug)
            printf("AccumulateWindingNumber %d\n", end-begin);
        while (begin != end) {
            // non-vertical
            while (begin != end && x(begin->edge->point1) != x(begin->edge->point2)) {
                if (begin->atPoint1)
                    windingNumberBefore(*begin) = rightWindingNumber;
                if (condition(*begin))
                {
                    if (!begin->atPoint1)
                        leftWindingNumber += begin->edge->deltaWindingNumber;
                    if (!begin->atPoint2)
                        rightWindingNumber += begin->edge->deltaWindingNumber;
                }
                if (begin->atPoint1)
                    windingNumberAfter(*begin) = rightWindingNumber;
                if (debug) {
                    printf(" %d -> %d : @(%d, %d) (%d, %d) (%d, %d) @1=%d @2=%d deltaWindingNumber=%d\n",
                        windingNumberBefore(*begin), windingNumberAfter(*begin), begin->atPoint1, begin->atPoint2,
                        x(begin->edge->point1), y(begin->edge->point1),
                        x(begin->edge->point2), y(begin->edge->point2),
                        begin->atPoint1, begin->atPoint2,
                        begin->edge->deltaWindingNumber);
                }
                ++begin;
            }

            // vertical
            bool atPoint1 = begin->atPoint1;
            for (auto it = begin; it != end && x(it->edge->point1) == x(it->edge->point2) && it->atPoint1 == atPoint1; ++it) {
                windingNumberBefore(*it) = leftWindingNumber;
                if (condition(*it))
                    leftWindingNumber += it->edge->deltaWindingNumber;
                windingNumberAfter(*it) = leftWindingNumber;
                if (debug) {
                    printf("[%d -> %d]: @(%d, %d) (%d, %d) (%d, %d) @1=%d @2=%d deltaWindingNumber=%d\n",
                        windingNumberBefore(*it), windingNumberAfter(*it), it->atPoint1, it->atPoint2,
                        x(it->edge->point1), y(it->edge->point1),
                        x(it->edge->point2), y(it->edge->point2),
                        it->atPoint1, it->atPoint2,
                        it->edge->deltaWindingNumber);
                }
            }

            // undo vertical
            for (auto it = begin; it != end && x(it->edge->point1) == x(it->edge->point2) && it->atPoint1 == atPoint1; ++it) {
                if (condition(*it)) {
                    leftWindingNumber -= it->edge->deltaWindingNumber;
                    if (debug) {
                        printf("prep: @(%d, %d) (%d, %d) (%d, %d) @1=%d @2=%d deltaWindingNumber=%d\n",
                            it->atPoint1, it->atPoint2,
                            x(it->edge->point1), y(it->edge->point1),
                            x(it->edge->point2), y(it->edge->point2),
                            it->atPoint1, it->atPoint2,
                            it->edge->deltaWindingNumber);
                    }
                }
            }

            // finished with vertical
            while (begin != end && x(begin->edge->point1) == x(begin->edge->point2) && begin->atPoint1 == atPoint1)
                ++begin;
        }

        if (debug)
            printf("~AccumulateWindingNumber\n");
    }
};

struct DefaultWindingNumberBefore {
    template<typename ScanlineEdge>
    int& operator()(ScanlineEdge& e) const {
        return e.windingNumberBefore;
    }
};

struct DefaultWindingNumberAfter {
    template<typename ScanlineEdge>
    int& operator()(ScanlineEdge& e) const {
        return e.windingNumberAfter;
    }
};

struct DefaultWindingNumberBefore2 {
    template<typename ScanlineEdge>
    int& operator()(ScanlineEdge& e) const {
        return e.windingNumberBefore2;
    }
};

struct DefaultWindingNumberAfter2 {
    template<typename ScanlineEdge>
    int& operator()(ScanlineEdge& e) const {
        return e.windingNumberAfter2;
    }
};

template<typename WindingNumberBefore, typename WindingNumberAfter, typename Condition>
AccumulateWindingNumber<WindingNumberBefore, WindingNumberAfter, Condition> makeAccumulateWindingNumber(WindingNumberBefore windingNumberBefore, WindingNumberAfter windingNumberAfter, Condition condition) {
    return{windingNumberBefore, windingNumberAfter, condition};
}

template<typename Condition>
AccumulateWindingNumber<DefaultWindingNumberBefore, DefaultWindingNumberAfter, Condition> makeAccumulateWindingNumber(Condition condition) {
    return{DefaultWindingNumberBefore{}, DefaultWindingNumberAfter{}, condition};
}

template<typename Condition>
AccumulateWindingNumber<DefaultWindingNumberBefore2, DefaultWindingNumberAfter2, Condition> makeAccumulateWindingNumber2(Condition condition) {
    return{DefaultWindingNumberBefore2{}, DefaultWindingNumberAfter2{}, condition};
}

template<typename ScanlineEdge, typename Condition, typename Combine>
struct CombinePairs {
public:
    Condition condition;
    Combine combine;

    CombinePairs(Condition condition, Combine combine) :
        condition(condition),
        combine(combine)
    {
    }

    CombinePairs(const CombinePairs&) = default;
    CombinePairs(CombinePairs&&) = default;
    CombinePairs& operator=(const CombinePairs&) = default;
    CombinePairs& operator=(CombinePairs&&) = default;

private:
    mutable std::vector<ScanlineEdge*> candidates;

    // negative: polygon travels from edge to scan point
    // positive: polygon travels from scan point to edge
    static int getEdgeDirection(const ScanlineEdge& scanlineEdge) {
        int i = scanlineEdge.edge->deltaWindingNumber;
        if (scanlineEdge.atPoint2)
            i = -i;
        if (x(scanlineEdge.edge->point1) == x(scanlineEdge.edge->point2))
            i = -i;
        return i;
    }

public:
    template<typename Unit, typename HighPrecision, typename It>
    void operator()(Unit scanX, HighPrecision scanY, It begin, It end) const
    {
        using Scan = Scan<ScanlineEdge>;

        //printf("CombinePairs %d\n", end-begin);
        candidates.clear();
        candidates.reserve(end-begin);
        for (auto it = begin; it < end; ++it)
            if (it->atEndpoint && it->edge->deltaWindingNumber && condition(*it))
                candidates.push_back(&*it);

        size_t b = 0;
        size_t e = candidates.size();
        while (b != e) {
            int edgeDirection = getEdgeDirection(*candidates[b]);
            auto other = e-1;
            while (other != b && getEdgeDirection(*candidates[other]) != -edgeDirection)
                --other;
            if (other != b) {
                if (edgeDirection < 0)
                    combine(*candidates[b], *candidates[other]);
                else
                    combine(*candidates[other], *candidates[b]);
                --e;
                candidates.erase(candidates.begin() + other);
            }
            else
                printf("!*!*!*!!!!*!*!! CombinePairs\n");
            ++b;
        }
        //printf("~CombinePairs\n");
    }
};

template<typename ScanlineEdge, typename Condition, typename Combine>
CombinePairs<ScanlineEdge, Condition, Combine> makeCombinePairs(Condition condition, Combine combine) {
    return{condition, combine};
}

struct PositiveWinding {
    template<typename ScanlineEdge>
    bool operator()(const ScanlineEdge& e) const{
        return !e.exclude && (
            e.windingNumberBefore == 0 && e.windingNumberAfter == 1 ||
            e.windingNumberBefore == 1 && e.windingNumberAfter == 0);
    }
};

template<typename PolygonSet, typename It>
void fillPolygonSetFromEdges(PolygonSet& ps, It begin, It end) {
    while (begin != end) {
        if (begin->next) {
            //printf("\n");
            ps.emplace_back();
            auto& polygon = ps.back();
            auto* edge = &*begin;
            while (true) {
                //printf("%d: %d, %d -> %d, %d deltaWindingNumber=%d\n", edge-&*begin, x(edge->point1), y(edge->point1), x(edge->point2), y(edge->point2), edge->deltaWindingNumber);
                auto* next = edge->next;
                edge->next = nullptr;
                edge = next;
                if (edge) {
                    if (swapped(*edge))
                        polygon.emplace_back(edge->point2);
                    else
                        polygon.emplace_back(edge->point1);
                }
                else
                    break;
            }
        }
        ++begin;
    }
}

template<typename PolygonSet, typename Winding>
PolygonSet cleanPolygonSet(const PolygonSet& ps, Winding winding) {
    using Point = PointFromPolygonSet_t<PolygonSet>;
    using Edge = Edge<Point, EdgeNext>;
    using ScanlineEdge = ScanlineEdge<Edge, ScanlineEdgeExclude, ScanlineEdgeWindingNumber>;
    using Scan = Scan<ScanlineEdge>;

    std::vector<Edge> edges;
    Scan::insertPolygons(edges, ps.begin(), ps.end());

    Scan::intersectEdges(edges, edges.begin(), edges.end());
    Scan::sortEdges(edges.begin(), edges.end());
    Scan::scan(
        edges.begin(), edges.end(),
        ExcludeOppositeEdges{},
        makeAccumulateWindingNumber(NotExcluded{}),
        makeCombinePairs<ScanlineEdge>(winding, [](ScanlineEdge& a, ScanlineEdge& b){a.edge->next = b.edge; }));

    PolygonSet result;
    fillPolygonSetFromEdges(result, edges.begin(), edges.end());
    return result;
}

template<typename CompareWinding>
struct CombinePolygonSetCondition {
    CompareWinding compareWinding;

    template<typename ScanlineEdge>
    bool operator()(ScanlineEdge& e) const {
        // 2 overlapping edges? keep only one.
        if (e.edge->id && e.windingNumberAfter != e.windingNumberBefore && e.windingNumberAfter2 != e.windingNumberBefore2)
            return false;
        bool before = compareWinding(e.windingNumberBefore, e.windingNumberBefore2);
        bool after = compareWinding(e.windingNumberAfter, e.windingNumberAfter2);
        return before != after;
    }
};

template<typename CompareWinding>
CombinePolygonSetCondition<CompareWinding> makeCombinePolygonSetCondition(CompareWinding compareWinding) {
    return{compareWinding};
}

template<typename PolygonSet, typename Condition>
PolygonSet combinePolygonSet(const PolygonSet& ps1, const PolygonSet& ps2, Condition condition) {
    using Point = PointFromPolygonSet_t<PolygonSet>;
    using Edge = Edge<Point, EdgeId, EdgeNext>;
    using ScanlineEdge = ScanlineEdge<Edge, ScanlineEdgeWindingNumber, ScanlineEdgeWindingNumber2>;
    using Scan = Scan<ScanlineEdge>;

    std::vector<Edge> edges;
    Scan::insertPolygons(edges, ps1.begin(), ps1.end());
    size_t edges1Size = edges.size();
    Scan::insertPolygons(edges, ps2.begin(), ps2.end());
    for (size_t i = edges1Size; i < edges.size(); ++i)
        edges[i].id = 1;

    Scan::intersectEdges(edges, edges.begin(), edges.end());
    Scan::sortEdges(edges.begin(), edges.end());
    Scan::scan(
        edges.begin(), edges.end(),
        makeAccumulateWindingNumber([](const ScanlineEdge& e){return e.edge->id == 0; }),
        makeAccumulateWindingNumber2([](const ScanlineEdge& e){return e.edge->id == 1; }),
        makeCombinePairs<ScanlineEdge>(condition, [](ScanlineEdge& a, ScanlineEdge& b){a.edge->next = b.edge; }));

    PolygonSet result;
    fillPolygonSetFromEdges(result, edges.begin(), edges.end());

    return result;
}

} // namespace FlexScan
