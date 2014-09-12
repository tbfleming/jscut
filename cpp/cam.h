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

#pragma once

#include <boost/polygon/polygon.hpp>

namespace cam {
    using Point = boost::polygon::point_data<int>;
    using Segment = boost::polygon::segment_data<int>;
    using Polygon = std::vector<Point>;
    using PolygonSet = std::vector<Polygon>;

    static const long long inchToClipperScale = 100000;
    static const long long cleanPolyDist = inchToClipperScale / 100000;
    static const long long arcTolerance = inchToClipperScale / 10000;

    // 2D point with Z. This is not a 3D point. Z is extra data; most operations ignore Z.
    struct PointWithZ {
        using coordinate_type = int;

        int x = 0;
        int y = 0;
        int z = 0;

        PointWithZ(int x = 0, int y = 0, int z = 0) :
            x{x},
            y{y},
            z{z}
        {
        }

        PointWithZ(const PointWithZ&) = default;

        PointWithZ(const Point& p) :
            x(boost::polygon::x(p)),
            y(boost::polygon::y(p))
        {
        }

        PointWithZ& operator=(const PointWithZ&) = default;

        Point toPoint() const
        {
            return{x, y};
        }
    };

    static bool operator==(const PointWithZ& a, const PointWithZ& b) {
        return a.x == b.x && a.y == b.y;
    }

    static bool operator!=(const PointWithZ& a, const PointWithZ& b) {
        return a.x != b.x || a.y != b.y;
    }

    static int x(PointWithZ p) {
        return p.x;
    }

    static int x(PointWithZ& p, int i) {
        p.x = i;
        return i;
    }

    static int y(PointWithZ p) {
        return p.y;
    }

    static int y(PointWithZ& p, int i) {
        p.y = i;
        return i;
    }

    static Point operator+(const Point& a, const Point& b) {
        return{x(a)+x(b), y(a)+y(b)};
    }

    static Point operator-(const Point& a, const Point& b) {
        return{x(a)-x(b), y(a)-y(b)};
    }

    static Point& operator*=(Point& a, int scale) {
        a.x(a.x() * scale);
        a.y(a.y() * scale);
        return a;
    }

    static PointWithZ operator+(const PointWithZ& a, const PointWithZ& b) {
        return{x(a)+x(b), y(a)+y(b)};
    }

    static PointWithZ operator-(const PointWithZ& a, const PointWithZ& b) {
        return{x(a)-x(b), y(a)-y(b)};
    }

    static PointWithZ& operator*=(PointWithZ& a, int scale) {
        a.x = a.x * scale;
        a.y = a.y * scale;
        return a;
    }

    // Convert paths to C format
    void convertPathsToC(
        double**& cPaths, int& cNumPaths, int*& cPathSizes,
        const PolygonSet& paths, bool includeDummyZ = false);

    // Convert paths to C format
    void convertPathsToC(
        double**& cPaths, int& cNumPaths, int*& cPathSizes,
        const std::vector<std::vector<PointWithZ>>& paths);

    // Convert paths from C format
    PolygonSet convertPathsFromC(
        double** paths, int numPaths, int* pathSizes);
}

namespace boost {
    namespace polygon {
        template <>
        struct geometry_concept<cam::Polygon>{ typedef polygon_concept type; };

        template <>
        struct polygon_traits<cam::Polygon> {
            typedef int coordinate_type;
            typedef cam::Polygon::const_iterator iterator_type;
            typedef cam::Point point_type;

            static inline iterator_type begin_points(const cam::Polygon& t) {
                return t.begin();
            }

            static inline iterator_type end_points(const cam::Polygon& t) {
                return t.end();
            }

            static inline std::size_t size(const cam::Polygon& t) {
                return t.size();
            }

            static inline winding_direction winding(const cam::Polygon& t) {
                return counterclockwise_winding;
            }
        };

        template <>
        struct polygon_mutable_traits<cam::Polygon> {
            //expects stl style iterators
            template <typename iT>
            static inline cam::Polygon& set_points(cam::Polygon& t,
                iT input_begin, iT input_end) {
                t.clear();
                t.insert(t.end(), input_begin, input_end);
                return t;
            }

        };
    }
}
