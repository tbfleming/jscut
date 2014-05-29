// Copyright 2014 Todd Fleming

function GcodeConversionViewModel(materialViewModel, toolModel, operationsViewModel) {
    var self = this;
    self.units = ko.observable("mm");
    self.unitConverter = new UnitConverter(self.units);
    self.gcodeUrl = ko.observable(null);

    self.generateGcode = function () {
        ops = [];
        if (operationsViewModel.operations().length == 0) {
            showAlert("There are no operations. Use the \"Create Operation\" button.", "alert-danger");
            return;
        }
        for (var i = 0; i < operationsViewModel.operations().length; ++i) {
            op = operationsViewModel.operations()[i];
            if (op.enabled()) {
                if (op.toolPaths == null || op.toolPaths.length == 0) {
                    showAlert("An operation is missing toolpaths; click \"Generate\" by all visible operations.", "alert-danger");
                    return;
                }
                ops.push(op);
            }
        }
        if (ops.length == 0) {
            showAlert("No operations are visible. Select the checkboxes by the operations you wish to convert.", "alert-danger");
            return;
        }

        var safeZ = self.unitConverter.fromPx(materialViewModel.unitConverter.toPx(materialViewModel.matZSafeMove()));
        var rapid = self.unitConverter.fromPx(toolModel.rapidRate.toPx());

        var gcode = "";
        if (self.units() == "inch")
            gcode += "G20         ; Set units to inches\r\n";
        else
            gcode += "G21         ; Set units to mm\r\n";
        gcode += "G90         ; Absolute positioning\r\n";
        gcode += "G1Z" + safeZ + "F" + rapid + "      ; Move to clearance level\r\n"

        for (var opIndex = 0, op = ops[opIndex]; opIndex < ops.length; ++opIndex) {
        }

        if (self.gcodeUrl() != null)
            URL.revokeObjectURL(self.gcodeUrl());
        self.gcodeUrl(URL.createObjectURL(new Blob([gcode])));
    }
}
