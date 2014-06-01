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

function UnitConverter(units) {
    var self = this;
    self.unitsObservables = [];

    units.subscribe(function (newValue) {
        if (newValue == "inch")
            for (var i = 0; i < self.unitsObservables.length ; ++i) {
                o = self.unitsObservables[i];
                o(o() / 25.4);
            }
        else
            for (var i = 0; i < self.unitsObservables.length ; ++i) {
                o = self.unitsObservables[i];
                o(o() * 25.4);
            }
    });

    self.toPx = function (x) {
        if (units() == "inch")
            return x * svgPxPerInch;
        else
            return x * svgPxPerInch / mmPerInch;
    }

    self.fromPx = function (px) {
        if (units() == "inch")
            return px / svgPxPerInch;
        else
            return px * mmPerInch / svgPxPerInch;
    }

    self.add = function (observable) {
        self.unitsObservables.push(observable);
        observable.units = function () {
            return units();
        }
        observable.toPx = function () {
            return self.toPx(observable());
        }
        observable.fromPx = function (px) {
            observable(self.fromPx(px));
        }
    }

    self.addComputed = function (observable) {
        observable.units = function () {
            return units();
        }
        observable.toPx = function () {
            return self.toPx(observable());
        }
    }
}
