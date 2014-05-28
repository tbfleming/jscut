// Copyright 2014 Todd Fleming

var mainSvg = Snap("#MainSvg");
var materialSvg = Snap("#MaterialSvg");
var contentGroup = mainSvg.group();
contentGroup.attr("filter", mainSvg.filter(Snap.filter.contrast(.5)));
var combinedGeometryGroup = mainSvg.g();
var toolPathsGroup = mainSvg.g();
var selectionGroup = mainSvg.g();

var materialViewModel = new MaterialViewModel();
var selectionViewModel = new SelectionViewModel(materialViewModel, selectionGroup);
var toolModel = new ToolModel();
var operationsViewModel = new OperationsViewModel(selectionViewModel, toolModel, combinedGeometryGroup, toolPathsGroup);

ko.applyBindings(materialViewModel, $("#Material")[0]);
ko.applyBindings(selectionViewModel, $("#CurveToLine")[0]);
ko.applyBindings(toolModel, $("#Tool")[0]);
ko.applyBindings(operationsViewModel, $("#Operations")[0]);
ko.applyBindings(operationsViewModel, $("#Operation")[0]);

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
function showAlert(message, alerttype, haveTimeout) {
    haveTimeout = (typeof haveTimeout === "undefined") ? true : false;
    var alertNum = nextAlertNum++;
    $('#alert_placeholder').prepend('<div id="AlertNum' + alertNum + '" class="alert ' + alerttype + '"><a class="close" data-dismiss="alert">&times;</a>' + message + '</div>')
    var result = $("#AlertNum" + alertNum);
    if (haveTimeout)
        setTimeout(function () {
            result.remove();
        }, 5000);
    return result;
}

Snap.load("Material.svg", function (f) {
    materialSvg.append(f);
    materialViewModel.materialSvg(materialSvg);
});

Snap.load("test.svg", function (f) {
    contentGroup.append(f);
});

$(document).on('change', '#choose-svg-file', function (event) {
    var files = event.target.files;
    for (var i = 0, file; file = files[i]; ++i) {
        (function (file) {
            var alert = showAlert("loading " + file.name, "alert-info", false);
            var reader = new FileReader();
            reader.onload = function (e) {
                svg = Snap.parse(e.target.result);
                contentGroup.append(svg);
                alert.remove();
                showAlert("loaded " + file.name, "alert-success");
            };
            reader.onabort = function (e) {
                alert.remove();
                showAlert("aborted reading " + file.name, "alert-danger");
            };
            reader.onerror = function (e) {
                alert.remove();
                showAlert("error reading " + file.name, "alert-danger");
            };
            reader.readAsText(file);
        })(file);
    }
    $(event.target).replaceWith(control = $(event.target).clone(true));
});

$("#MainSvg").click(function (e) {
    var element = Snap.getElementByPoint(e.pageX, e.pageY);
    if (element != null)
        operationsViewModel.clickOnSvg(element) ||
        selectionViewModel.clickOnSvg(element);
});

$('#createOperationButton').popover({
    trigger: "manual",
    html: true,
    content: "<p class='bg-danger'>Select 1 or more objects before clicking here</p>",
    container: "body",
    placement: "right"
});

$('#createOperationButton').parent().hover(
    function () {
        if ($('#createOperationButton').attr("disabled"))
            $('#createOperationButton').popover('show');
    },
    function () { $('#createOperationButton').popover('hide'); });
