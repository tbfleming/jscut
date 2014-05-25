// Copyright 2014 Todd Fleming

function MaterialViewModel() {
    function formatZ(z) {
        z = parseFloat(z);
        return z.toFixed(3);
    }

    var self = this;
    self.matUnits = ko.observable("inch");
    self.matThickness = ko.observable("1.0");
    self.matZOrigin = ko.observable("Top");
    self.matClearance = ko.observable("1.0");
    self.materialSvg = ko.observable(null);

    self.matUnits.subscribe(function (newValue) {
        if (newValue == "inch") {
            self.matThickness(self.matThickness() / 25.4);
            self.matClearance(self.matClearance() / 25.4);
        } else {
            self.matThickness(self.matThickness() * 25.4);
            self.matClearance(self.matClearance() * 25.4);
        }
    });

    self.matTopZ = ko.computed(function () {
        if (self.matZOrigin() == "Top")
            return 0;
        else
            return self.matThickness();
    });

    self.matBotZ = ko.computed(function () {
        if (self.matZOrigin() == "Bottom")
            return 0;
        else
            return "-" + self.matThickness();
    });

    self.matZSafeMove = ko.computed(function () {
        if (self.matZOrigin() == "Top")
            return self.matClearance();
        else
            return parseFloat(self.matThickness()) + parseFloat(self.matClearance());
    });

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
        // Propagate current values to materialSvg
        self.matZOrigin("Bottom");
        self.matZOrigin("Top");
    });
}
