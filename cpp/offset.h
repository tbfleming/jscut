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

#include "FlexScan.h"

namespace FlexScan {

template<typename Polygon>
static Polygon rawOffset(const Polygon& path, UnitFromPolygon_t<Polygon> amount, UnitFromPolygon_t<Polygon> arcTolerance, bool closed) {
    using Point = PointFromPolygon_t<Polygon>;
    using Unit = UnitFromPolygon_t<Polygon>;
    using Segment = bp::segment_data<Unit>;

    if (amount == 0)
        return path;
    if (path.size() < 2)
        return{};

    auto startTime = std::chrono::high_resolution_clock::now();

    auto processSegment = [arcTolerance](Polygon& raw, const Point& p0, const Point& p1, const Point& p2, int amount) {
        if (p1 == p0)
            return;

        auto getNormal = [](const Point& p1, const Point& p2, int amount) -> Point {
            double length = euclidean_distance(p1, p2);
            return{lround(double(y(p2)-y(p1))*amount/length), lround(double(x(p1)-x(p2))*amount/length)};
        };

        auto normal01 = getNormal(p0, p1, amount);
        auto normal12 = getNormal(p1, p2, amount);
        auto o = orientation(Segment{p1, {x(p1)+x(normal01), y(p1)+y(normal01)}}, Segment{p1, {x(p1)+x(normal12), y(p1)+y(normal12)}});
        if (amount < 0)
            o = -o;

        // turn left
        if (o == 1 || o == 0 && dot(normal01, normal12) < 0) {
            raw.push_back({x(p1)+x(normal01), y(p1)+y(normal01)});

            double baseAngle = atan2(y(normal01), x(normal01));
            double q = ((double)x(normal01)*x(normal12) + (double)y(normal01)*y(normal12)) / amount / amount;
            q = std::min(1.0, std::max(-1.0, q));
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

            raw.push_back({x(p1)+x(normal12), y(p1)+y(normal12)});
        }

        // straight
        else if (o == 0) {
            raw.push_back({x(p1)+x(normal01), y(p1)+y(normal01)});
        }

        // turn right
        else {
            raw.push_back({x(p1)+x(normal01), y(p1)+y(normal01)});
            raw.push_back(p1);
            raw.push_back({x(p1)+x(normal12), y(p1)+y(normal12)});
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

    printf("rawOffset time: %d\n", (int)std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::high_resolution_clock::now() - startTime).count());

    return raw;
}

template<typename PolygonSet>
static PolygonSet rawOffsetPolygonSet(const PolygonSet& ps, UnitFromPolygonSet_t<PolygonSet> amount, UnitFromPolygonSet_t<PolygonSet> arcTolerance, bool closed) {
    PolygonSet result;
    for (auto& poly: ps) {
        auto raw = rawOffset(poly, amount, arcTolerance, closed);
        result.push_back(move(raw));
    }
    return result;
}

template<typename PolygonSet>
static PolygonSet offset(const PolygonSet& ps, UnitFromPolygonSet_t<PolygonSet> amount, UnitFromPolygonSet_t<PolygonSet> arcTolerance, bool closed) {
    using Polygon = PolygonFromPolygonSet_t<PolygonSet>;

    PolygonSet result;
    for (auto& poly: ps) {
        Polygon raw = rawOffset(poly, amount, arcTolerance, closed);
        result.push_back(move(raw));
    }

    auto cleanStartTime = std::chrono::high_resolution_clock::now();
    result = cleanPolygonSet(result, PositiveWinding{});
    printf("offset clean time: %d\n", (int)std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::high_resolution_clock::now() - cleanStartTime).count());
    printf("polys: %d\n", result.size());

    return result;
}

} // namespace FlexScan
