// Copyright 2014 Todd Fleming

var mainSvg = Snap("#MainSvg");
var materialSvg = Snap("#MaterialSvg");
var contentGroup = mainSvg.group();
contentGroup.attr("filter", mainSvg.filter(Snap.filter.contrast(.5)));
var selectionGroup = mainSvg.g(mainSvg.circle(10, 10, 100, 100));

var materialViewModel = new MaterialViewModel();
var selectionViewModel = new SelectionViewModel(selectionGroup);

ko.applyBindings(materialViewModel, $("#Material")[0]);
ko.applyBindings(selectionViewModel, $("#Selection")[0]);


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

var nextAlertNum = 1;
function showAlert(message, alerttype) {
    var alertNum = nextAlertNum++;
    $('#alert_placeholder').prepend('<div id="AlertNum' + alertNum + '" class="alert ' + alerttype + '"><a class="close" data-dismiss="alert">&times;</a>' + message + '</div>')
    setTimeout(function () {
        $("#AlertNum" + alertNum).remove();
    }, 5000);
}

Snap.load("Material.svg", function (f) {
    materialSvg.append(f);
    materialViewModel.materialSvg(materialSvg);
});

Snap.load("test.svg", function (f) {
    contentGroup.append(f);
});

$("#MainSvg").click(function (e) {
    selectionViewModel.toggleSelect(Snap.getElementByPoint(e.pageX, e.pageY));
});
