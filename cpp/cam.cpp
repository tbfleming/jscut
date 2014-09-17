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

#include "cam.h"

using namespace cam;

// Convert paths to C format
void cam::convertPathsToC(
    double**& cPaths, int& cNumPaths, int*& cPathSizes,
    const PolygonSet& paths, bool includeDummyZ
    )
{
    //!!!! don't need double
    int stride = includeDummyZ ? 3 : 2;
    cPaths = (double**)malloc(paths.size() * sizeof(double*));
    cNumPaths = paths.size();
    cPathSizes = (int*)malloc(paths.size() * sizeof(int));
    for (size_t i = 0; i < paths.size(); ++i) {
        const Polygon& path = paths[i];
        cPathSizes[i] = path.size();
        char* pathStorage = (char*)malloc(path.size() * stride * sizeof(double) + sizeof(double) / 2);
        // cPaths[i] contains the unaligned block so the javascript side can free it properly.
        cPaths[i] = (double*)pathStorage;
        if ((int)pathStorage & 4)
            pathStorage += 4;
        double* p = (double*)pathStorage;
        for (size_t j = 0; j < path.size(); ++j) {
            p[j*stride] = x(path[j]);
            p[j*stride+1] = y(path[j]);
            if (includeDummyZ)
                p[j*stride+2] = 0;
        }
    }
}

// Convert paths to C format
void cam::convertPathsToC(
    double**& cPaths, int& cNumPaths, int*& cPathSizes,
    const std::vector<std::vector<PointWithZ>>& paths
    )
{
    //!!!! don't need double
    printf("ma: %d->%d\n", paths.size(), paths.size() * sizeof(double*));
    cPaths = (double**)malloc(paths.size() * sizeof(double*));
    cNumPaths = paths.size();
    printf("mb: %d->%d\n", paths.size(), paths.size() * sizeof(int));
    cPathSizes = (int*)malloc(paths.size() * sizeof(int));
    for (size_t i = 0; i < paths.size(); ++i) {
        const auto& path = paths[i];
        cPathSizes[i] = path.size();
        //printf("mc: %d->%d\n", path.size(), path.size() * 3 * sizeof(double) + sizeof(double) / 2);
        char* pathStorage = (char*)malloc(path.size() * 3 * sizeof(double) + sizeof(double) / 2);
        // cPaths[i] contains the unaligned block so the javascript side can free it properly.
        cPaths[i] = (double*)pathStorage;
        if ((int)pathStorage & 4)
            pathStorage += 4;
        double* p = (double*)pathStorage;
        for (size_t j = 0; j < path.size(); ++j) {
            p[j*3] = path[j].x;
            p[j*3+1] = path[j].y;
            p[j*3+2] = path[j].z;
        }
    }
    printf("m done\n");
}

PolygonSet cam::convertPathsFromC(
    double** paths, int numPaths, int* pathSizes)
{
    //!!!! don't need double
    PolygonSet geometry;
    for (int i = 0; i < numPaths; ++i) {
        geometry.push_back({});
        auto& newPath = geometry.back();
        double* p = paths[i];
        int l = pathSizes[i];
        for (int j = 0; j < l; ++j)
            newPath.push_back({lround(p[j*2]), lround(p[j*2+1])});
    }
    return geometry;
}
