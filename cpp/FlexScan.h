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

namespace FlexScan {

namespace bp = boost::polygon;

template<typename... Less>
struct ChainLess;

template<typename Less0, typename... Less>
struct ChainLess<Less0, Less...> {
    Less0 less0;
    ChainLess<Less...> rest;

    ChainLess(Less0 less0, Less... less) :
        less0{less0},
        rest{less...}
    {
    }

    ChainLess(const ChainLess&) = default;
    ChainLess(ChainLess&&) = default;
    ChainLess& operator=(const ChainLess&) = default;
    ChainLess& operator=(ChainLess&&) = default;

    template<typename T>
    bool operator()(const T& a, const T& b) const
    {
        return less0(a, b) || !less0(b, a) && rest(a, b);
    }
};

template<>
struct ChainLess<> {
    template<typename T>
    bool operator()(const T& a, const T& b) const
    {
        return false;
    }
};

template<typename... Less>
ChainLess<Less...> chainLess(Less... less)
{
    return{less...};
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
    using HighPrecision = bp::high_precision_type<Unit>;

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
    using HighPrecision = bp::high_precision_type<Unit>;
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

    static bool lessSlope(const Edge& e1, const Edge& e2)
    {
        return ScanlineBase::less_slope(dx(e1), dy(e1), dx(e2), dy(e2));
    }

    static bool lessSlope(const ScanlineEdge& e1, const ScanlineEdge& e2)
    {
        return lessSlope(*e1->edge, *e2->edge);
    }

    static HighPrecision evalAtXforY(Unit x, const Edge& edge)
    {
        return ScanlineBase::evalAtXforY(x, toScanlineBasePoint(edge.point1), toScanlineBasePoint(edge.point2));
    }

    static bool lessEdge(const Edge& e1, const Edge& e2)
    {
        return x(e1.point1) < x(e2.point1);
    }

    template<typename Container, typename It>
    static bool intersectEdges(Container& dest, It begin, It end) {
        //std::vector<std::pair<ScanlineBasePoint, ScanlineBasePoint>> segments;
        //segments.reserve(src.size());
        //for (auto& edge)
        //    segments.emplace_back(toScanlineBasePoint(edge.point1), toScanlineBasePoint(edge.point2));

        std::vector<std::pair<std::pair<ScanlineBasePoint, ScanlineBasePoint>, int> > intersected;
        intersected.reserve(end - begin);
        bp::line_intersection<Unit>::validate_scan(intersected, begin, end);

        Container result;
        result.reserve(intersected.size());
        for (auto& segment: intersected) {
            auto edge = begin[segment.second];
            edge.point1 = segment.first.first;
            edge.point2 = segment.first.second;
            result.push_back(edge);
        }

        dest = move(result);
    }

    template<typename EdgeIt>
    static bool sortEdges(EdgeIt begin, EdgeIt end) {
        std::sort(begin, end, lessEdge);
    }

    static const auto lessScanlineEdge = chainLess(
        [](const ScanlineEdge& e1, const ScanlineEdge& e2){return x(e1.yIntercept) < x(e2.yIntercept);},
        [](const ScanlineEdge& e1, const ScanlineEdge& e2){return x(e1.atEndpoint) < x(e2.atEndpoint);},
        lessSlope);

    template<typename It, typename Callback0, typename... Callback>
    void callCallback(Unit x, HighPrecision y, It begin, It end, const Callback0& callback0, const Callback&... callback)
    {
        callback0(x, y, begin, end);
        callCallback(x, y, begin, end, callback...);
    }

    template<typename It>
    void callCallback(Unit x, HighPrecision y, It begin, It end)
    {
    }

    template<typename EdgeIt, typename... Callback>
    void operator()(
        EdgeIt edgeBegin,
        EdgeIt edgeEnd,
        Callback... callback)
    {
        if (edgeBegin == edgeEnd)
            return;

        Unit scanX = x(*edgeBegin);
        std::vector<ScanlineEdge> scanlineEdges;
        while (edgeBegin != edgeEnd) {
            while (x(*edgeBegin) == scanX) {
                ScanlineEdge sledge{&*edgeBegin};
                sledge.atPoint1 = true;
                scanlineEdges.push_back(sledge);
                ++edgeBegin;
            }

            for (auto& scanlineEdge: scanlineEdges) {
                auto& edge = *scanlineEdge.edge;
                scanlineEdge.yIntercept = evalAtXforY(scanX, edge);
                scanlineEdge.atEndpoint = scanX == x(edge) || scanX == x(edge);
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
                callCallback(scanX, scanlineEdgeIt->yIntercept, scanlineEdgeIt, e);
                scanlineEdgeIt = e;
            }

            scanlineEdges.erase(
                std::remove_if(scanlineEdges.begin(), scanlineEdges.end(), [](const ScanlineEdge& e){return e.atPoint2; }),
                scanlineEdges.end());
            scanX = std::numeric_limits<Unit>::max();
            for (auto& e: scanlineEdges)
                scanX = min(scanX, x(e.edge->point1));

            if (edgeBegin != edgeEnd)
                scanX = min(scanX, x(edgeBegin->point1));
        }
    }
}; // Scan

struct ExcludeOppositeEdges {
    template<typename Unit, typename HighPrecision, typename It>
    void operator()(Unit x, HighPrecision y, It begin, It end)
    {
        while (true) {
            while (begin != end && begin->exlude)
                ++begin;
            if (begin == end)
                break;
            for (auto otherIt = begin+1; otherIt != end; ++otherIt) {
                if (!otherIt->exclude && begin->edge->count == -otherIt->edge->count) {
                    // Only use X,Y for comparison
                    auto p1 = toScanlineBasePoint(begin->edge->p1);
                    auto p2 = toScanlineBasePoint(begin->edge->p2);
                    auto op1 = toScanlineBasePoint(otherIt->edge->p1);
                    auto op2 = toScanlineBasePoint(otherIt->edge->p2);
                    if (p1 == op1 && p2 == op2) {
                        begin->exlude = true;
                        otherIt->exclude = true;
                        break;
                    }
                }
            }
            ++begin;
        }
    }
};

} // namespace FlexScan
