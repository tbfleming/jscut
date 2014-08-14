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
jscut.data = jscut.data || {};

(function () {
    "use strict";

    // Get the factor to convert units ("inch" or "mm") to inch
    jscut.data.getInchConversion = function (units) {
        if (units == "inch")
            return 1;
        else if (units == "mm")
            return 1 / 25.4;
        else {
            console.log("jscut.data.getInchConversion: units must be 'inch' or 'mm'");
            return Number.NaN;
        }
    }

    // Convert value to inch
    jscut.data.toInch = function (value, units) {
        return jscut.data.getInchConversion(units) * value;
    }

    // Convert value from inch
    jscut.data.fromInch = function (value, units) {
        return value / jscut.data.getInchConversion(units);
    }

    // Clean up material and return new object. Automatically converts old formats to new. json may be an object or text; if it's null or undefined then this creates an object with default values.
    jscut.data.cleanMaterial = function (json) {
        if (typeof json === 'undefined' || json == null)
            json = {};
        else if (typeof json === 'string')
            json = JSON.parse(json);

        var result = {
            units: "inch",
            thickness: "1.0",
            zOrigin: "Top",
            clearance: "0.1",
        }

        function fetch(name) {
            var v = json[name];
            if (typeof v !== "undefined")
                result[name] = v;
        }

        fetch('units');

        if (result.units == "mm") {
            result.thickness *= 25.4;
            result.clearance *= 25.4;
        }

        fetch('thickness');
        fetch('zOrigin');
        fetch('clearance');

        return result;
    }

    // Clean up tool and return new object. Automatically converts old formats to new. json may be an object or text; if it's null or undefined then this creates an object with default values.
    jscut.data.cleanTool = function (json) {
        if (typeof json === 'undefined' || json == null)
            json = {};
        else if (typeof json === 'string')
            json = JSON.parse(json);

        var result = {
            units: 'inch',
            diameter: .125,
            passDepth: .125,
            stepover: .4,
            rapidRate: 100,
            plungeRate: 5,
            cutRate: 40,
        }

        function fetch(name) {
            var v = json[name];
            if (typeof v !== "undefined")
                result[name] = v;
        }

        fetch('units');

        if (result.units == "mm") {
            result.diameter *= 2.54;
            result.passDepth *= 2.54;
            result.stepover *= 2.54;
            result.rapidRate *= 2.54;
            result.plungeRate *= 2.54;
            result.cutRate *= 2.54;
        }

        fetch('diameter');
        fetch('passDepth');
        if (typeof json.overlap !== "undefined") // backwards compat
            result.stepover = 1 - json.overlap;
        fetch('stepover');
        fetch('rapidRate');
        fetch('plungeRate');
        fetch('cutRate');

        return result;
    }

    // Clean up operation and return new object. Automatically converts old formats to new. json may be an object or text; if it's null or undefined then this creates an object with default values.
    jscut.data.cleanOperation = function (json) {
        if (typeof json === 'undefined' || json == null)
            json = {};
        else if (typeof json === 'string')
            json = JSON.parse(json);

        var result = {
            name: "",
            units: "inch",
            //enabled: true,
            ramp: true,
            combineOp: "Union",
            camOp: "Pocket",
            direction: "Conventional",
            cutDepth: .125,
            margin: 0,
            width: 0,
            geometries: [],
        }

        function fetch(name) {
            var v = json[name];
            if (typeof v !== "undefined")
                result[name] = v;
        }

        fetch('name');
        fetch('units');

        if (result.units == "mm") {
            result.cutDepth *= 2.54;
            result.margin *= 2.54;
            result.width *= 2.54;
        }

        //fetch('enabled');
        fetch('ramp');
        fetch('combineOp');
        fetch('camOp');
        fetch('direction');
        fetch('cutDepth');
        fetch('margin');
        fetch('width');
        fetch('geometries');

        if (result.camOp == "Outline") // backwards compat
            result.camOp = "Outside";

        return result;
    }

    // Clean up gcode options and return new object. Automatically converts old formats to new. json may be an object or text; if it's null or undefined then this creates an object with default values.
    jscut.data.cleanGcodeOptions = function (json) {
        if (typeof json === 'undefined' || json == null)
            json = {};
        else if (typeof json === 'string')
            json = JSON.parse(json);

        var result = {
            units: "mm",
            //gcodeFilename: "gcode.gcode",
            offsetX: 0,
            offsetY: 0,
        }

        function fetch(name) {
            var v = json[name];
            if (typeof v !== "undefined")
                result[name] = v;
        }

        fetch('units');

        if (result.units == "inch") {
            result.offsetX /= 25.4;
            result.offsetY /= 25.4;
        }

        //fetch('gcodeFilename');
        fetch('offsetX');
        fetch('offsetY');

        return result;
    }
})();
