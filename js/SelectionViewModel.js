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

function SelectionViewModel(materialViewModel, selectionGroup) {
    var self = this;

    self.selMinNumSegments = ko.observable("1");
    self.selMinSegmentLength = ko.observable("0.1");
    self.selNumSelected = ko.observable("0");

    materialViewModel.unitConverter.add(self.selMinSegmentLength);

    self.clickOnSvg = function (elem) {
        if (elem.attr("class") == "selectedPath") {
            elem.remove();
            self.selNumSelected(self.selNumSelected() - 1);
            return true;
        }

        var path = Path.getLinearSnapPathFromElement(elem, self.selMinNumSegments(), self.selMinSegmentLength.toPx(), function (msg) {
            showAlert(msg, "alert-warning");
        });

        if (path != null) {
            selectionGroup.path(path).attr("class", "selectedPath");
            self.selNumSelected(self.selNumSelected() + 1);
        }

        return true;
    }

    self.getSelection = function () {
        return selectionGroup.selectAll("Path");
    }

    self.clearSelection = function () {
        selectionGroup.selectAll("Path").remove();
        self.selNumSelected(0);
    }
}
