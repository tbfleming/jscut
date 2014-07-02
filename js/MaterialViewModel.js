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

function MaterialViewModel() {
    "use strict";
    var self = this;
    self.matUnits = ko.observable("inch");
    self.unitConverter = new UnitConverter(self.matUnits);
    self.matThickness = ko.observable("1.0");
    self.matZOrigin = ko.observable("Top");
    self.matClearance = ko.observable("0.1");
    self.materialSvg = ko.observable(null);

    self.unitConverter.add(self.matThickness);
    self.unitConverter.add(self.matClearance);

    self.matTopZ = ko.computed(function () {
        if (self.matZOrigin() == "Top")
            return 0;
        else
            return self.matThickness();
    });
    self.unitConverter.addComputed(self.matTopZ);

    self.matBotZ = ko.computed(function () {
        if (self.matZOrigin() == "Bottom")
            return 0;
        else
            return "-" + self.matThickness();
    });
    self.unitConverter.addComputed(self.matBotZ);

    self.matZSafeMove = ko.computed(function () {
        if (self.matZOrigin() == "Top")
            return parseFloat(self.matClearance());
        else
            return parseFloat(self.matThickness()) + parseFloat(self.matClearance());
    });
    self.unitConverter.addComputed(self.matZSafeMove);

    function formatZ(z) {
        z = parseFloat(z);
        return z.toFixed(3);
    }

    self.matTopZ.subscribe(function (newValue) {
        if (self.materialSvg())
            self.materialSvg().select("#matTopZ").node.textContent = formatZ(newValue);
    });

    self.matBotZ.subscribe(function (newValue) {
        if (self.materialSvg())
            self.materialSvg().select("#matBotZ").node.textContent = formatZ(newValue);
    });

    self.matZSafeMove.subscribe(function (newValue) {
        if (self.materialSvg())
            self.materialSvg().select("#matZSafeMove").node.textContent = formatZ(newValue);
    });

    self.materialSvg.subscribe(function (newValue) {
        newValue.select("#matTopZ").node.textContent = formatZ(self.matTopZ());
        newValue.select("#matBotZ").node.textContent = formatZ(self.matBotZ());
        newValue.select("#matZSafeMove").node.textContent = formatZ(self.matZSafeMove());
    });

    self.toJson = function () {
        return {
            'units': self.matUnits(),
            'thickness': self.matThickness(),
            'zOrigin': self.matZOrigin(),
            'clearance': self.matClearance(),
        };
    }

    self.fromJson = function (json) {
        function f(j, o) {
            if (typeof j !== "undefined")
                o(j);
        }

        if (json) {
            f(json.units, self.matUnits);
            f(json.thickness, self.matThickness);
            f(json.zOrigin, self.matZOrigin);
            f(json.clearance, self.matClearance);
        }
    }
}
