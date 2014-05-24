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

function linearizeSegment(p1x, p1y, c1x, c1y, c2x, c2y, p2x, p2y, minLineSegment) {
    function bez(p0, p1, p2, p3, t) {
        return (1 - t) * (1 - t) * (1 - t) * p0 + 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t * p3;
    }

    if (p1x == c1x && p1y == c1y && p2x == c2x && p2y == c2y)
        return ['L', p2x, p2y];

    var numSegments = 1;
    while (true) {
        var x = p1x;
        var y = p1y;
        var result = ['L'];
        for (var i = 1; i <= numSegments; ++i) {
            t = 1.0 * i / numSegments;
            var nextX = bez(p1x, c1x, c2x, p2x, t);
            var nextY = bez(p1y, c1y, c2y, p2y, t);
            if ((nextX - x) * (nextX - x) + (nextY - y) * (nextY - y) > minLineSegment * minLineSegment) {
                numSegments *= 2;
                result = null;
                break;
            }
            result.push(nextX, nextY);
            x = nextX;
            y = nextY;
        }
        if (result)
            return result;
    }
}

function linearizePath(path, minLineSegment) {
    if (path.length < 2 || path[0].length != 3 || path[0][0] != 'M')
        return null;
    var x = path[0][1];
    var y = path[0][2];
    var result = [path[0]];
    for (var i = 1; i < path.length; ++i) {
        subpath = path[i];
        if (subpath[0] == 'C' && subpath.length == 7) {
            result.push(linearizeSegment(x, y, subpath[1], subpath[2], subpath[3], subpath[4], subpath[5], subpath[6], minLineSegment));
            x = subpath[5];
            y = subpath[6];
        } else if (subpath[0] == 'M' && subpath.length == 3) {
            result.push(subpath);
            x = subpath[1];
            y = subpath[2];
        } else
            return null;
    }
    return result;
}

function selectPath(elem) {
    if (elem.attr("SelectedPath") == "true") {
        elem.remove();
        return;
    }

    var path = null;
    if (elem.type == "svg")
        return;
    else if (elem.attr('clip-path') != "none")
        showAlert("clip-path is not supported", "alert-warning");
    else if (elem.attr('mask') != "none")
        showAlert("mask is not supported", "alert-warning");
    else if (elem.type == "path")
        path = elem.attr("d");
    else
        showAlert(elem.type + " is not supported; try Inkscape's <strong>Object to Path</strong> command", "alert-warning");

    if (path == null)
        return;
    path = Snap.path.map(path, elem.transform().globalMatrix);
    path = Snap.parsePathString(path);
    path = linearizePath(path, 50);
    if (path == null) {
        showAlert("failed to linearize path", "alert-warning");
        return;
    }

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
