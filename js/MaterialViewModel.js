// Copyright 2014 Todd Fleming

function MaterialViewModel() {
    function formatZ(z) {
        z = parseFloat(z);
        return z.toFixed(3);
    }

    this.matUnits = ko.observable("inch");
    this.matThickness = ko.observable("1.0");
    this.matZOrigin = ko.observable("Top");
    this.matClearance = ko.observable("1.0");
    this.materialSvg = ko.observable(null);

    this.matUnits.subscribe(function (newValue) {
        if (newValue == "inch") {
            this.matThickness(this.matThickness() / 25.4);
            this.matClearance(this.matClearance() / 25.4);
        } else {
            this.matThickness(this.matThickness() * 25.4);
            this.matClearance(this.matClearance() * 25.4);
        }
    }, this);

    this.matTopZ = ko.computed(function () {
        if (this.matZOrigin() == "Top")
            return 0;
        else
            return this.matThickness();
    }, this);

    this.matBotZ = ko.computed(function () {
        if (this.matZOrigin() == "Bottom")
            return 0;
        else
            return "-" + this.matThickness();
    }, this);

    this.matZSafeMove = ko.computed(function () {
        if (this.matZOrigin() == "Top")
            return this.matClearance();
        else
            return parseFloat(this.matThickness()) + parseFloat(this.matClearance());
    }, this);

    this.matTopZ.subscribe(function (newValue) {
        if (this.materialSvg())
            this.materialSvg().select("#matTopZ").node.textContent = formatZ(newValue);
    }, this);

    this.matBotZ.subscribe(function (newValue) {
        if (this.materialSvg())
            this.materialSvg().select("#matBotZ").node.textContent = formatZ(newValue);
    }, this);

    this.matZSafeMove.subscribe(function (newValue) {
        if (this.materialSvg())
            this.materialSvg().select("#matZSafeMove").node.textContent = formatZ(newValue);
    }, this);

    this.materialSvg.subscribe(function (newValue) {
        // Propagate current values to materialSvg
        this.matZOrigin("Bottom");
        this.matZOrigin("Top");
    }, this);
}
