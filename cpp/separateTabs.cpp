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
#include "offset.h"

using namespace cam;
using namespace boost::polygon::operators;
using namespace std;

static const long long spiralArcTolerance = inchToClipperScale / 1000;

extern "C" void separateTabs(
    double** pathPolygons, int numPaths, int* pathSizes,
    double** tabPolygons, int numTabPolygons, int* tabPolygonSizes,
    double**& resultPaths, int& resultNumPaths, int*& resultPathSizes)
{
    try {
        PolygonSet paths = convertPathsFromC(pathPolygons, numPaths, pathSizes);
        PolygonSet tabs = convertPathsFromC(tabPolygons, numTabPolygons, tabPolygonSizes);

        convertPathsToC(resultPaths, resultNumPaths, resultPathSizes, paths);
    }
    catch (exception& e) {
        printf("%s\n", e.what());
    }
    catch (...) {
        printf("???? unknown exception\n");
    }
};
