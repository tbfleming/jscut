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

jscut.parseGcode = function (options, gcode) {
    "use strict";
    var startTime = Date.now();
    if (options.profile)
        console.log("parseGcode...");

    var path = [];
    var lastX = NaN, lastY = NaN, lastZ = NaN, lastF = NaN;
    var stride = 4;
    var i = 0;
    while (i < gcode.length) (function () {
        function parse() {
            ++i;
            while (i < gcode.length && (gcode[i] == ' ' || gcode[i] == '\t'))
                ++i;
            var begin = i;
            while (i < gcode.length && "+-.0123456789".indexOf(gcode[i]) != -1)
                ++i;
            return Number(gcode.substr(begin, i - begin));
        }
        var g = NaN, x = NaN, y = NaN, z = NaN, f = NaN;
        while (i < gcode.length && gcode[i] != ';' && gcode[i] != '\r' && gcode[i] != '\n') {
            if (gcode[i] == 'G' || gcode[i] == 'g')
                g = parse();
            else if (gcode[i] == 'X' || gcode[i] == 'x')
                x = parse();
            else if (gcode[i] == 'Y' || gcode[i] == 'y')
                y = parse();
            else if (gcode[i] == 'Z' || gcode[i] == 'z')
                z = parse();
            else if (gcode[i] == 'F' || gcode[i] == 'f')
                f = parse();
            else
                ++i;
        }
        if (g == 0 || g == 1) {
            if (!isNaN(x)) {
                if (isNaN(lastX))
                    for (var j = 0; j < path.length; j += stride)
                        path[j] = x;
                lastX = x;
            }
            if (!isNaN(y)) {
                if (isNaN(lastY))
                    for (var j = 1; j < path.length; j += stride)
                        path[j] = y;
                lastY = y;
            }
            if (!isNaN(z)) {
                if (isNaN(lastZ))
                    for (var j = 2; j < path.length; j += stride)
                        path[j] = z;
                lastZ = z;
            }
            if (!isNaN(f)) {
                if (isNaN(lastF))
                    for (var j = 3; j < path.length; j += stride)
                        path[j] = f;
                lastF = f;
            }
            path.push(lastX);
            path.push(lastY);
            path.push(lastZ);
            path.push(lastF);
        }
        while (i < gcode.length && gcode[i] != '\r' && gcode[i] != '\n')
            ++i;
        while (i < gcode.length && (gcode[i] == '\r' || gcode[i] == '\n'))
            ++i;
    })();

    if (options.profile)
        console.log("parseGcode: " + (Date.now() - startTime));

    return path;
}
