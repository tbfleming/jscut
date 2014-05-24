// Copyright 2014 Todd Fleming

var mainSvg = Snap("#MainSvg");
var content;
var selectionGroup;
var materialSvg = Snap("#MaterialSvg");
var materialSvgReady = false;

function updateSvgAutoHeight() {
    $("svg.autoheight").each(function () {
        internalWidth = $(this).attr("internalWidth");
        internalHeight = $(this).attr("internalHeight");
        $(this).height($(this).width() * internalHeight / internalWidth);
    });
}

$(function () {
    updateSvgAutoHeight();
    $(window).resize(updateSvgAutoHeight);
});

function formatZ(z) {
    z = parseFloat(z);
    return z.toFixed(3);
}

function AppViewModel() {
    this.matUnits = ko.observable("inch");
    this.matThickness = ko.observable("1.0");
    this.matZOrigin = ko.observable("Bottom");
    this.matClearance = ko.observable("1.0");

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
        if (materialSvgReady)
            materialSvg.select("#matTopZ").node.textContent = formatZ(newValue);
    });

    this.matBotZ.subscribe(function (newValue) {
        if (materialSvgReady)
            materialSvg.select("#matBotZ").node.textContent = formatZ(newValue);
    });

    this.matZSafeMove.subscribe(function (newValue) {
        if (materialSvgReady)
            materialSvg.select("#matZSafeMove").node.textContent = formatZ(newValue);
    });
}

var appViewModel = new AppViewModel();
ko.applyBindings(appViewModel);

var nextAlertNum = 1;
function showAlert(message, alerttype) {
    var alertNum = nextAlertNum++;
    $('#alert_placeholder').prepend('<div id="AlertNum' + alertNum + '" class="alert ' + alerttype + '"><a class="close" data-dismiss="alert">&times;</a>' + message + '</div>')
    setTimeout(function () {
        $("#AlertNum" + alertNum).remove();
    }, 5000);
}

function selectPath(elem) {
    if (elem.attr("SelectedPath") == "true") {
        elem.remove();
        return;
    }

    var path = getLinearSnapPathFromElement(elem, 1, 3, function (msg) {
        showAlert(msg, "alert-warning");
    });

    if (path != null)
        selectionGroup.path(path).attr({ "SelectedPath": "true", "style": "fill:#0000ff" });
}

Snap.load("Material.svg", function (f) {
    materialSvg.append(f);
    materialSvgReady = true;
    appViewModel.matZOrigin("Top");
});

Snap.load("test.svg", function (f) {
    content = mainSvg.group();
    content.append(f);
    content.attr("filter", mainSvg.filter(Snap.filter.contrast(.5)));
    selectionGroup = mainSvg.g(mainSvg.circle(10, 10, 100, 100));
});

$("#MainSvg").click(function (e) {
    selectPath(Snap.getElementByPoint(e.pageX, e.pageY));
});
