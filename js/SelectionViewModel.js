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

function SelectionViewModel(svgViewModel, materialViewModel, selectionGroup) {
    "use strict";
    var self = this;

    self.selMinNumSegments = ko.observable("1");
    self.selMinSegmentLength = ko.observable("0.01");
    self.selNumSelected = ko.observable("0");

    materialViewModel.unitConverter.add(self.selMinSegmentLength);

    self.clickOnSvg = function (elem) {
        if (elem.attr("class") == "selectedPath") {
            elem.remove();
            self.selNumSelected(self.selNumSelected() - 1);
            return true;
        }

        var path = jscut.priv.path.getLinearSnapPathFromElement(elem, self.selMinNumSegments(), self.selMinSegmentLength.toInch() * svgViewModel.pxPerInch(), function (msg) {
            showAlert(msg, "alert-warning");
        });

        if (path != null) {
            var newPath = selectionGroup.path(path);
            newPath.attr("class", "selectedPath");
            if (elem.attr("fill-rule") == "evenodd")
                newPath.attr("fill-rule", "evenodd");
            self.selNumSelected(self.selNumSelected() + 1);
        }

        return true;
    }

    self.getSelection = function () {
        return selectionGroup.selectAll("path");
    }

    self.clearSelection = function () {
        selectionGroup.selectAll("path").remove();
        self.selNumSelected(0);
    }

    self.toJson = function () {
        return {
            'minNumSegments': self.selMinNumSegments(),
            'minSegmentLength': self.selMinSegmentLength(),
        };
    }

    self.fromJson = function (json) {
        function f(j, o) {
            if (typeof j !== "undefined")
                o(j);
        }

        if (json) {
            f(json.minNumSegments, self.selMinNumSegments);
            f(json.minSegmentLength, self.selMinSegmentLength);
        }
    }
}
