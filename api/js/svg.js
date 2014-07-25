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

var jscut = jscut || {};
jscut.svg = jscut.svg || {};

(function () {
    "use strict";

    // Remove all children from an SVG object
    jscut.svg.clear = function (svg) {
        while (svg.firstChild)
            svg.removeChild(svg.firstChild);
    }

    // Add geometry to an SVG object. Updates SVG's viewBow. Closes each path if
    // closePaths is true. closePaths defaults to true; set it to false it you're
    // converting CAM paths.
    jscut.svg.addGeometryToSvg = function (svg, geometry, pxPerInch, attributes, closePaths) {
        var path = jscut.geometry.toSvgPathObject(geometry, pxPerInch, attributes, closePaths);
        svg.appendChild(path);
        var bbox = svg.getBBox();
        svg.setAttribute("viewBox", bbox.x + " " + bbox.y + " " + bbox.width + " " + bbox.height);
    }

    // Add cam paths to an SVG object. Updates SVG's viewBow.
    jscut.svg.addCamPathsToSvg = function (svg, camPaths, pxPerInch, attributes) {
        var geometry = [];
        for (var i = 0; i < camPaths.length; ++i)
            geometry.push(camPaths[i].path);
        var path = jscut.geometry.toSvgPathObject(geometry, pxPerInch, attributes, false);
        svg.appendChild(path);
        var bbox = svg.getBBox();
        svg.setAttribute("viewBox", bbox.x + " " + bbox.y + " " + bbox.width + " " + bbox.height);
    }
})();
