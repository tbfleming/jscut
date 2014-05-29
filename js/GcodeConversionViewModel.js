// Copyright 2014 Todd Fleming

function GcodeConversionViewModel(materialViewModel, toolModel, operationsViewModel) {
    var self = this;
    self.units = ko.observable("mm");
    self.unitConverter = new UnitConverter(self.units);
}
