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

function MiscViewModel() {
    var self = this;
    self.enableGoogleDrive = ko.observable(options.enableGoogleDrive);
    self.enableDropbox = ko.observable(options.enableDropbox);
    self.debug = ko.observable(options.debug);
    self.debugArg0 = ko.observable(0);
    self.debugArg1 = ko.observable(0);
    self.saveSettingsFilename = ko.observable("settings.jscut");
    self.loadLocalStorageFilename = ko.observable("settings.jscut");
    self.launchChiliUrl = ko.observable(null);
    self.saveGistDescription = ko.observable("jscut settings");
    self.savedGistUrl = ko.observable("");
    self.savedGistLaunchUrl = ko.observable("");
    self.localStorageSettings = ko.observableArray([]);
    self.loadedCamCpp = ko.observable(false);
    self.camCppError = ko.observable("");
}

var mainSvg = Snap("#MainSvg");
var materialSvg = Snap("#MaterialSvg");
var contentGroup = mainSvg.group();
contentGroup.attr("filter", mainSvg.filter(Snap.filter.contrast(.5)).attr("filterUnits", "objectBoundingBox"));
var combinedGeometryGroup = mainSvg.g();
var tabsGroup = mainSvg.g();
var toolPathsGroup = mainSvg.g();
var selectionGroup = mainSvg.g();
var renderPath;

var svgViewModel;
var materialViewModel;
var selectionViewModel;
var toolModel;
var operationsViewModel;
var tabsViewModel;
var gcodeConversionViewModel;
var miscViewModel;

function loadScript(path, loadedCallback, errorCallback) {
    var done = false;
    var script = document.createElement('script');

    function handleLoad() {
        if (!done) {
            done = true;
            loadedCallback();
        }
    }

    function handleReadyStateChange() {
        var state;

        if (!done) {
            done = true;
            if (script.readyState === "complete")
                loadedCallback();
            else
                errorCallback();
        }
    }

    function handleError() {
        if (!done) {
            done = true;
            errorCallback();
        }
    }

    script.onload = handleLoad;
    script.onreadystatechange = handleReadyStateChange;
    script.onerror = handleError;
    script.src = path;
    document.body.appendChild(script);
}

var downloadCppStarted = false;
var triedPaths = [];
function downloadCpp() {
    downloadCppStarted = true;
    if (options.camCppPaths.length == 0) {
        console.log('Error: nothing left to try; cam-cpp is unavailable.\n');
        var e = "cam-cpp.js is unavailable; tried the following paths:<ul>";
        for (var i = 0; i < triedPaths.length; ++i)
            e += "<li>" + triedPaths[i] + "</li>";
        e += "</ul>"
        miscViewModel.camCppError(e);
        return;
    }
    var nextLocation = options.camCppPaths.shift();
    var script = nextLocation + "/cam-cpp.js";
    triedPaths.push(script);

    loadScript(
        script,
        function () {
            console.log('cam-cpp found: ' + script);
            miscViewModel.loadedCamCpp(true);
        },
        downloadCpp);
}
window.addEventListener("load", function () {
    if (!downloadCppStarted)
        downloadCpp();
}, false);

miscViewModel = new MiscViewModel();
svgViewModel = new SvgViewModel();
materialViewModel = new MaterialViewModel();
selectionViewModel = new SelectionViewModel(svgViewModel, materialViewModel, selectionGroup);
toolModel = new ToolModel();
operationsViewModel = new OperationsViewModel(
    miscViewModel, options, svgViewModel, materialViewModel, selectionViewModel, toolModel, combinedGeometryGroup, toolPathsGroup,
    function () { gcodeConversionViewModel.generateGcode(); });
tabsViewModel = new TabsViewModel(
    miscViewModel, options, svgViewModel, materialViewModel, selectionViewModel, tabsGroup,
    function () { gcodeConversionViewModel.generateGcode(); });
gcodeConversionViewModel = new GcodeConversionViewModel(options, miscViewModel, materialViewModel, toolModel, operationsViewModel, tabsViewModel);

ko.applyBindings(materialViewModel, $("#Material")[0]);
ko.applyBindings(selectionViewModel, $("#CurveToLine")[0]);
ko.applyBindings(toolModel, $("#Tool")[0]);
ko.applyBindings(operationsViewModel, $("#Operations")[0]);
ko.applyBindings(tabsViewModel, $("#Tabs")[0]);
ko.applyBindings(gcodeConversionViewModel, $("#GcodeConversion")[0]);
ko.applyBindings(gcodeConversionViewModel, $("#FileGetGcode1")[0]);
ko.applyBindings(gcodeConversionViewModel, $("#simulatePanel")[0]);
ko.applyBindings(miscViewModel, $("#SaveSettings1")[0]);
ko.applyBindings(miscViewModel, $("#LaunchChiliPeppr")[0]);
ko.applyBindings(miscViewModel, $("#save-gist-warning")[0]);
ko.applyBindings(miscViewModel, $("#save-gist-result")[0]);
ko.applyBindings(miscViewModel, $("#load-local-storage-settings-modal")[0]);
ko.applyBindings(miscViewModel, $("#delete-local-storage-settings-modal")[0]);
ko.applyBindings(miscViewModel, $("#saveSettingsGoogle1")[0]);
ko.applyBindings(miscViewModel, $("#saveGcodeGoogle1")[0]);
ko.applyBindings(miscViewModel, $("#openSvgGoogle1")[0]);
ko.applyBindings(miscViewModel, $("#loadSettingsGoogle1")[0]);
ko.applyBindings(miscViewModel, $("#openSvgDropbox1")[0]);


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

function updateSvgSize() {
    bbox = mainSvg.getBBox();
    $("#MainSvg").attr({
        width: $("#MainSvgDiv").width(),
        height: Math.max(10, $(window).height() - 120),
        preserveAspectRatio: 'xMinYMin meet',
    });
    // attr() messes viewBox up
    $("#MainSvg").get(0).setAttribute("viewBox", (bbox.x - 2) + " " + (bbox.y - 2) + " " + (bbox.w + 4) + " " + (bbox.h + 4));
}

$(function () {
    updateSvgSize();
    $(window).resize(updateSvgSize);
});

function updateRenderPathSize() {
    $("#renderPathCanvas").attr({
        width: $("#MainSvgDiv").width(),
        height: $("#MainSvgDiv").width(),
    });
}

$(function () {
    updateRenderPathSize();
    $(window).resize(updateRenderPathSize);
    renderPath = startRenderPath(options, $("#renderPathCanvas")[0], $('#timeSlider'), 'js', function () { });
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

var tutorialAlert = null;
var nextTutorialStep = 0;
function tutorial(step, message) {
    if (step >= nextTutorialStep) {
        if (tutorialAlert != null)
            tutorialAlert.remove();
        tutorialAlert = showAlert("Step " + step + ": " + message, "alert-info", false);
        nextTutorialStep = step + 1;
    }
}

tutorial(1, 'Open an SVG file.');

function loadSvg(alert, filename, content) {
    svg = Snap.parse(content);
    contentGroup.append(svg);
    updateSvgSize();
    if(alert)
        alert.remove();
    showAlert("loaded " + filename, "alert-success");
    tutorial(2, 'Click 1 or more objects.');
}

$(document).on('change', '#choose-svg-file', function (event) {
    var files = event.target.files;
    for (var i = 0, file; file = files[i]; ++i) {
        (function (file) {
            var alert = showAlert("loading " + file.name, "alert-info", false);
            var reader = new FileReader();
            reader.onload = function (e) {
                loadSvg(alert, file.name, e.target.result);
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

function openSvgDropbox() {
    Dropbox.choose({
        success: function (files) {
            var alert = showAlert("loading " + files[0].name, "alert-info", false);
            $.get(files[0].link, function (content) {
                loadSvg(alert, files[0].name, content);
            }, "text").fail(function () {
                alert.remove();
                showAlert("load " + files[0].name + " failed", "alert-danger");
            });
        },
        linkType: "direct",
    });
}

$("#MainSvg").click(function (e) {
    var element = Snap.getElementByPoint(e.pageX, e.pageY);
    if (element != null) {
        operationsViewModel.clickOnSvg(element) || tabsViewModel.clickOnSvg(element) || selectionViewModel.clickOnSvg(element);
        if (selectionViewModel.selNumSelected() > 0) {
            tutorial(3, 'Click "Create Operation" after you have finished selecting objects.');
        }
    }
});

function makeAllSameUnit(val) {
    "use strict";
    materialViewModel.matUnits(val);
    tabsViewModel.units(val);
    toolModel.units(val);
    gcodeConversionViewModel.units(val);

    var ops = operationsViewModel.operations();
    for (var i = 0; i < ops.length; ++i)
        ops[i].units(val);
}

function popoverHover(obj, placement, content) {
    $(obj).popover({
        trigger: "hover",
        html: true,
        content: content,
        container: "body",
        placement: placement
    });
}

popoverHover('#pxPerInch', "bottom", "SVG editors use different scales from each other; set this to allow sizes come out correctly.<br><br><table><tr><td>Inkscape 0.9x:<td>96<tr><td>Inkscape 0.4x:<td>90<tr><td>Adobe Illustrator:<td>72<tr><td>CorelDRAW:<td>96</table>");

popoverHover('#tabsMaxCutDepth', "right", "Maximum depth operations may cut when they pass over tabs");

popoverHover('#toolDiameter', "right", "Diameter of tool. V Pocket ignores this. Simulate GCODE also ignores Diameter if Angle < 180.");
popoverHover('#toolAngle', "right", "Angle of V cutter. 180 for normal (flat bottom) tools. V Pocket is the only operation which obeys this. Simulate GCODE always obeys it.");
popoverHover('#toolPassDepth', "right", "Maximum depth the tool should plunge each pass. Use a smaller pass depth for harder materials and better quality.");
popoverHover('#toolStepOver', "right", "What fraction of the tool diameter the tool should step over each time around a loop. Smaller values produce better cuts and reduce tool wear, but take longer to complete.");
popoverHover('#toolRapidRate', "right", "The speed the tool moves while not cutting");
popoverHover('#toolPlungeRate', "right", "The speed the tool plunges downwards into the material");
popoverHover('#toolCutRate', "right", "The speed the tool moves horizontally during cutting");

popoverHover('#inputMatThickness', "top", "How thick is the material");
popoverHover('#selectMatZOrigin', "top", "What is considered the 0 Z position");
popoverHover('#inputMatClearance', "top", "How high the tool moves over the material. Increase this when using clamps or screws to fasten the material.");

popoverHover('#inputSelMinNumSegments', "top", "Minimum number of line segments to convert a curve to. jscut does this conversion when you select an object (it becomes blue).");
popoverHover('#inputSelMinSegmentLength', "top", "Minimum length of each line segment when converting curves. jscut does this conversion when you select an object (it becomes blue).");

popoverHover('#gcodeZeroLowerLeft', "top", "Changes the X and Y Offset values so that 0,0 is at the lower-left corner of all tool paths.");
popoverHover('#gcodeZeroCenter', "top", "Changes the X and Y Offset values so that 0,0 is at the center of all tool paths.");
popoverHover('#gcodeReturn00', "top", "Move the tool to 0,0 after the last operation.");
popoverHover('#gcodeOffsetX', "top", "Amount to add to gcode X coordinates");
popoverHover('#gcodeOffsetY', "top", "Amount to add to gcode Y coordinates");
popoverHover('#gcodeMinX', "top", "Minimum X coordinate in gcode. If this is out of range of your machine then adjust X Offset.");
popoverHover('#gcodeMaxX', "top", "Maximum X coordinate in gcode. If this is out of range of your machine then adjust X Offset.");
popoverHover('#gcodeMinY', "top", "Minimum Y coordinate in gcode. If this is out of range of your machine then adjust Y Offset.");
popoverHover('#gcodeMaxY', "top", "Maximum Y coordinate in gcode. If this is out of range of your machine then adjust Y Offset.");

var operationPopovers = {
    opEnabled: ['top', 'Whether this operation is enabled'],
    opOperation: ['top', 'What operation type to perform'],
    opGenerate: ['top', 'Generate toolpath for operation'],
    opShowDetail: ['top', 'Show additional detail'],
    opName: ['right', 'Name used in gcode comments'],
    opRamp: ['right', 'Ramp the cutter in gradually instead of plunging straight down'],
    opCombine: ['right', 'How to combine multiple objects into this operation'],
    opDirection: ['right', 'What direction the cutter should travel'],
    opCutDepth: ['top', 'How deep this operation should cut in total'],
    opVMaxDepth: ['right', "Maximum depth this operation should cut. <p class='bg-danger'>not implemented yet; this is ignored.</p>"],
    opMargin: ['right', 'Positive: how much material to leave uncut.<br><br>Negative: how much extra material to cut'],
    opWidth: ['right', 'How wide a path to cut. If this is less than the cutter width then it uses the cutter width.'],
}

var tabPopovers = {
    tabEnabled: ['top', 'Whether this tab is enabled'],
    tabMargin: ['top', 'Positive: how much to expand tab.<br><br>Negative: how much to shrink tab.'],
}

function hookupOperationPopovers(nodes) {
    "use strict";
    for (var i = 0; i < nodes.length; ++i) {
        var node = nodes[i];
        hookupOperationPopovers(node.childNodes);
        if (node.id in operationPopovers)
            popoverHover(node, operationPopovers[node.id][0], operationPopovers[node.id][1]);
    }
}

function hookupTabPopovers(nodes) {
    "use strict";
    for (var i = 0; i < nodes.length; ++i) {
        var node = nodes[i];
        hookupTabPopovers(node.childNodes);
        if (node.id in tabPopovers)
            popoverHover(node, tabPopovers[node.id][0], tabPopovers[node.id][1]);
    }
}

$('#createOperationButton').popover({
    trigger: "manual",
    html: true,
    content: "<p class='bg-danger'>Select 1 or more objects in the \"Edit Toolpaths\" tab before clicking here</p>",
    container: "body",
    placement: "right"
});

$('#createOperationButton').parent().hover(
    function () {
        if ($('#createOperationButton').attr("disabled"))
            $('#createOperationButton').popover('show');
    },
    function () { $('#createOperationButton').popover('hide'); });

function toJson() {
    return {
        'svg': svgViewModel.toJson(),
        'material': materialViewModel.toJson(),
        'curveToLineConversion': selectionViewModel.toJson(),
        'tool': toolModel.toJson(),
        'operations': operationsViewModel.toJson(),
        'tabs': tabsViewModel.toJson(),
        'gcodeConversion': gcodeConversionViewModel.toJson(),
    };
}

function fromJson(json) {
    if (json) {
        svgViewModel.fromJson(json.svg);
        materialViewModel.fromJson(json.material);
        selectionViewModel.fromJson(json.curveToLineConversion);
        toolModel.fromJson(json.tool);
        operationsViewModel.fromJson(json.operations);
        tabsViewModel.fromJson(json.tabs);
        gcodeConversionViewModel.fromJson(json.gcodeConversion);
        updateSvgSize();
    }
}

function showSaveSettingsModal() {
    "use strict";
    $('#save-settings-modal').modal('show');
}

$(document).on('change', '#choose-settings-file', function (event) {
    var files = event.target.files;
    for (var i = 0, file; file = files[i]; ++i) {
        (function (file) {
            var alert = showAlert("loading " + file.name, "alert-info", false);
            var reader = new FileReader();
            reader.onload = function (e) {
                fromJson(JSON.parse(e.target.result));
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

var googleDeveloperKey = 'AIzaSyABOorNywzgSXQ8Waffle8zAhfgkHUBw0M';
var googleClientId = '103921723157-leb9b5b4i79euhnn96nlpeeev1m3pvg0.apps.googleusercontent.com';
var googleAuthApiLoaded = false;
var googlePickerApiLoaded = false;
var googleDriveApiLoaded = false;

function onGoogleApiLoad() {
    gapi.load('auth', function () { googleAuthApiLoaded = true; });
    gapi.load('picker', function () { googlePickerApiLoaded = true; });
}

function onGoogleClientLoad() {
    gapi.client.load('drive', 'v2', function () { googleDriveApiLoaded = true; });
}

var googleDriveReadToken;
function googleDriveAuthRead(callback) {
    if (!googleAuthApiLoaded)
        return;
    else if (googleDriveReadToken)
        callback();
    else
        window.gapi.auth.authorize({
            'client_id': googleClientId,
            'scope': ['https://www.googleapis.com/auth/drive.readonly'],
            'immediate': false
        }, function (authResult) {
            if (authResult && !authResult.error) {
                googleDriveReadToken = authResult.access_token;
                callback();
            }
        });
}

var googleDriveWriteToken;
function googleDriveAuthWrite(callback) {
    if (!googleAuthApiLoaded)
        return;
    else if (googleDriveWriteToken)
        callback();
    else
        window.gapi.auth.authorize({
            'client_id': googleClientId,
            'scope': ['https://www.googleapis.com/auth/drive'],
            'immediate': false
        }, function (authResult) {
            if (authResult && !authResult.error) {
                googleDriveWriteToken = authResult.access_token;
                callback();
            }
        });
}

function openGoogle(picker, wildcard, callback) {
    googleDriveAuthRead(function () {
        if (googlePickerApiLoaded && googleDriveApiLoaded) {
            if (!picker.picker) {
                picker.picker = new google.picker.PickerBuilder();
                picker.picker.addView(
                    new google.picker.DocsView(google.picker.ViewId.DOCS).
                        setQuery(wildcard));
                picker.picker.enableFeature(google.picker.Feature.NAV_HIDDEN);
                picker.picker.setOAuthToken(googleDriveReadToken);
                picker.picker.setDeveloperKey(googleDeveloperKey);
                picker.picker.setCallback(function (data) {
                    if (data[google.picker.Response.ACTION] == google.picker.Action.PICKED) {
                        var doc = data[google.picker.Response.DOCUMENTS][0];
                        var name = doc[google.picker.Document.NAME];
                        var id = doc[google.picker.Document.ID];

                        var alert = showAlert("loading " + name, "alert-info", false);
                        gapi.client.drive.files.get({
                            'fileId': id
                        }).execute(function (resp) {
                            if (resp.error) {
                                alert.remove();
                                showAlert(resp.error.message, "alert-danger");
                            } else {
                                var xhr = new XMLHttpRequest();
                                xhr.open('GET', resp.downloadUrl);
                                xhr.setRequestHeader('Authorization', 'Bearer ' + googleDriveReadToken);
                                xhr.onload = function (content) {
                                    if (this.status == 200)
                                        callback(alert, name, this.responseText);
                                    else {
                                        alert.remove();
                                        showAlert(this.statusText, "alert-danger");
                                    }
                                };
                                xhr.onerror = function () {
                                    alert.remove();
                                    showAlert("load " + name + " failed", "alert-danger");
                                };
                                xhr.overrideMimeType('text');
                                xhr.send();
                            }
                        });
                    }
                });
                picker.picker = picker.picker.build();
            }
            picker.picker.setVisible(true);
        }
    });
} // openGoogle()

function saveGoogle(filename, content, callback) {
    googleDriveAuthWrite(function () {
        if (googlePickerApiLoaded && googleDriveApiLoaded && googleDriveWriteToken) {
            const boundary = '-------53987238478475486734879872344353478123';
            const delimiter = "\r\n--" + boundary + "\r\n";
            const close_delim = "\r\n--" + boundary + "--";

            var contentType = 'text/plain';
            var metadata = {
                'title': filename,
                'mimeType': contentType
            };

            var multipartRequestBody =
                delimiter +
                'Content-Type: application/json\r\n\r\n' +
                JSON.stringify(metadata) +
                delimiter +
                'Content-Type: ' + contentType + '\r\n' +
                '\r\n' +
                content +
                close_delim;

            var request = gapi.client.request({
                'path': '/upload/drive/v2/files',
                'method': 'POST',
                'params': { 'uploadType': 'multipart' },
                'headers': {
                    'Content-Type': 'multipart/mixed; boundary="' + boundary + '"'
                },
                'body': multipartRequestBody
            });

            var alert = showAlert("saving " + filename, "alert-info", false);
            request.execute(function (result) {
                if (result.error) {
                    alert.remove();
                    showAlert(result.error.message, "alert-danger");
                } else {
                    alert.remove();
                    showAlert("saved " + filename, "alert-success");
                    callback();
                }
            });
        }
    });
} // saveGoogle()

var googleOpenSvgPicker = {};
function openSvgGoogle() {
    openGoogle(googleOpenSvgPicker, '*.svg', loadSvg);
}

function saveGcodeGoogle(callback) {
    if (gcodeConversionViewModel.gcode() == "") {
        showAlert('Click "Generate Gcode" first', "alert-danger");
        return;
    }
    saveGoogle(gcodeConversionViewModel.gcodeFilename(), gcodeConversionViewModel.gcode(), callback);
}

var googleOpenSettingsPicker = {};
function loadSettingsGoogle() {
    openGoogle(googleOpenSettingsPicker, '*.jscut', function (alert, filename, content) {
        fromJson(JSON.parse(content));
        alert.remove();
        showAlert("loaded " +filename, "alert-success");
});
}

function saveSettingsGoogle(callback) {
    saveGoogle(miscViewModel.saveSettingsFilename(), JSON.stringify(toJson()), callback);
}

/* Support for storing settings in the browser local storage
 */
function showLoadSettingsFromLocalStorageModal() {
    "use strict";

    var settings = localStorage.getItem("settings");
    if (settings == null) {
      showAlert("No settings stored locally yet.", "alert-danger");
    }
    miscViewModel.localStorageSettings(Object.keys(JSON.parse(settings)));

    $('#load-local-storage-settings-modal').modal('show');
}

function loadSettingsLocalStorage() {
    var alert = showAlert("Loading settings from browser local storage", "alert-info", false);
    console.log("loadSettingsLocalStorage");
    var settings = JSON.parse(localStorage.getItem("settings"));
    fromJson(settings[miscViewModel.loadLocalStorageFilename()]);
    $('#load-local-storage-settings-modal').modal('hide');
    alert.remove();
}

function deleteSettingsLocalStorage() {
    var settings = JSON.parse(localStorage.getItem("settings"));
    delete settings[miscViewModel.loadLocalStorageFilename()];
    localStorage.setItem("settings", JSON.stringify(settings));
    $('#delete-local-storage-settings-modal').modal('hide');
    showAlert('Deleted "' + miscViewModel.loadLocalStorageFilename() + '" from browser local storage', "alert-info");
}

function saveSettingsLocalStorage(callback) {
    var alert = showAlert("Saving settings into browser local storage", "alert-info", false);
    var settings = JSON.parse(localStorage.getItem("settings"));
    if (settings == null) {
      settings = {};
    }
    settings[miscViewModel.saveSettingsFilename()] = toJson();
    localStorage.setItem("settings", JSON.stringify(settings));
    alert.remove();
    callback();
}

/* Support for storing settings and gcode in local files
 */
function saveGcodeLocalFile(callback) {
    if (gcodeConversionViewModel.gcode() == "") {
        showAlert('Click "Generate Gcode" first', "alert-danger");
        return;
    }
    var blob = new Blob([gcodeConversionViewModel.gcode()], {type: 'text/plain'});
    saveAs(blob, gcodeConversionViewModel.gcodeFilename());
    callback();
}

function saveSettingsLocalFile(callback) {
    var blob = new Blob([JSON.stringify(toJson())], {type: 'text/json'});
    saveAs(blob, miscViewModel.saveSettingsFilename());
    callback();
}

function saveSettingsGist() {
    var alert = showAlert("Saving Anonymous Gist", "alert-info", false);
    var files = { "settings.jscut": { "content": JSON.stringify(toJson()) } };

    var svgs = contentGroup.node.childNodes;
    for (var i = 0; i < svgs.length; ++i)
        if (svgs[i].nodeName == 'svg')
            files['svg' + i + '.svg'] = { "content": new XMLSerializer().serializeToString(svgs[i]) };

    $.ajax({
        url: "https://api.github.com/gists",
        type: "POST",
        dataType: "json",
        crossDomain: true,
        data: JSON.stringify({
            "description": miscViewModel.saveGistDescription(),
            "public": true,
            "files": files,
        })
    })
    .done(function (content) {
        alert.remove();
        showAlert("Saved Anonymous Gist", "alert-success");
        $('#save-gist-warning').modal('hide');
        $('#save-gist-result').modal('show');
        miscViewModel.savedGistUrl(content.html_url);
        miscViewModel.savedGistLaunchUrl("http://jscut.org/jscut.html?gist="+content.id);
    })
    .fail(function (e) {
        alert.remove();
        showAlert("Can't save Anonymous Gist: " + e.responseText, "alert-danger");
    });
}

function loadGist(gist) {
    var url = 'https://api.github.com/gists/' + gist;
    var alert = showAlert("loading " + url, "alert-info", false);
    $.get(url, function (content) {
        var jscutFiles = [], svgFiles = [], otherFiles = [];
        alert.remove();
        for (var filename in content.files) {
            if (filename.indexOf('.jscut', filename.length - 6) !== -1)
                jscutFiles.push(filename);
            else if (filename.indexOf('.svg', filename.length - 4) !== -1)
                svgFiles.push(filename);
            else
                otherFiles.push(filename);
        }

        if (jscutFiles.length == 0) {
            if (svgFiles.length > 0)
                showAlert("No .jscut files found in gist", "alert-info");
            else if (otherFiles.length == 0)
                showAlert("No files found in gist", "alert-danger");
            else if (otherFiles.length == 1)
                jscutFiles = otherFiles;
            else
                showAlert("No .jscut files or .svg files found in gist", "alert-danger");
        } else if (jscutFiles.length > 1)
            showAlert("Multiple .jscut files found; ignoring them", "alert-danger");

        for (var i = 0; i < svgFiles.length; ++i)
            loadSvg(null, svgFiles[i], content.files[svgFiles[i]].content);

        if (jscutFiles.length == 1) {
            try {
                fromJson(JSON.parse(content.files[jscutFiles[0]].content));
                showAlert("loaded " +jscutFiles[0], "alert-success");
                operationsViewModel.tutorialGenerateToolpath();
            } catch (e) {
                showAlert(e.message, "alert-danger");
            }
        }
    }, "json").fail(function (e) {
        alert.remove();
        showAlert("load " + url + " failed", "alert-danger");
    });
}

var searchArgs = window.location.search.substr(1).split('&');
for (var i = 0; i < searchArgs.length; ++i) {
    var arg = searchArgs[0];
    if (arg.substr(0, 5) == 'gist=')
        loadGist(arg.substr(5));
}

function chiliGetUser(callback) {
    "use strict";
    $.getJSON("http://www.chilipeppr.com/datalogin?callback=?")
    .done(function (content) {
        if (typeof content.CurrentUser === "undefined")
            showAlert("Can't get current user from http://chilipeppr.com/", "alert-danger");
        else if (content.CurrentUser == null)
            showAlert("Not logged into http://chilipeppr.com/", "alert-danger");
        else if (typeof content.CurrentUser.ID === "undefined")
            showAlert("Can't get current user from http://chilipeppr.com/", "alert-danger");
        else
            callback(content.CurrentUser.ID);
    })
    .fail(function (e) {
        showAlert("Can't get current user from http://chilipeppr.com/", "alert-danger");
    });
}

function chiliSaveGcode() {
    var key = 'org-jscut-gcode-' + gcodeConversionViewModel.gcodeFilename();
    chiliGetUser(function (userId) {
        var alert = showAlert("Sending gcode to chilipeppr.com", "alert-info", false);
        $.ajax({
            url: "http://www.chilipeppr.com/dataput",
            type: "POST",
            crossDomain: true,
            xhrFields: {
                withCredentials: true
            },
            data: { key: key, val: gcodeConversionViewModel.gcode() },
            dataType: "json",
        })
        .done(function (content) {
            alert.remove();
            if(content.Error)
                showAlert(content.msg);
            else if (typeof content.Value !== "undefined") {
                miscViewModel.launchChiliUrl('http://chilipeppr.com/tinyg?loadJscut=' + encodeURIComponent(key));
                $('#save-gcode-modal').modal('hide');
                $('#launch-chilipeppr-modal').modal('show');
            }
            else
                showAlert("Can't save gcode to http://chilipeppr.com/", "alert-danger");
        })
        .fail(function (e) {
            alert.remove();
            showAlert("Can't save gcode to http://chilipeppr.com/", "alert-danger");
        });
    });
}

if (typeof options.preloadInBrowser == 'string' && options.preloadInBrowser.length > 0) {
    var settings = JSON.parse(localStorage.getItem("settings"));
    fromJson(settings[options.preloadInBrowser]);
}
