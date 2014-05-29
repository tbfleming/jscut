// Copyright 2014 Todd Fleming

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

    self.add = function(observable) {
        self.unitsObservables.push(observable);
        observable.units = function () {
            return units();
        }
        observable.toPx = function () {
            if (units() == "inch")
                return observable() * svgPxPerInch;
            else
                return observable() * svgPxPerInch / mmPerInch;
        }
        observable.fromPx = function (px) {
            if (units() == "inch")
                observable(px / svgPxPerInch);
            else
                observable(px * mmPerInch / svgPxPerInch);
        }
    }
}

function MaterialViewModel() {
    svgPxPerInch = 90;
    mmPerInch = 25.4;

    var self = this;
    self.matUnits = ko.observable("inch");
    self.unitConverter = new UnitConverter(self.matUnits);
    self.matThickness = ko.observable("1.0");
    self.matZOrigin = ko.observable("Top");
    self.matClearance = ko.observable("1.0");
    self.materialSvg = ko.observable(null);

    self.unitConverter.add(self.matThickness);
    self.unitConverter.add(self.matClearance);

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
}
