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
        tutorialAlert = showAlert("Etape " + step + ": " + message, "alert-info", false);
        nextTutorialStep = step + 1;
    }
}

tutorial(1, 'Ouvrir un fichier .SVG');

function loadSvg(alert, filename, content) {
    svg = Snap.parse(content);
    contentGroup.append(svg);
    updateSvgSize();
    if(alert)
        alert.remove();
    showAlert("Chargé " + filename, "alert-success");
    tutorial(2, 'Cliquez sur 1 ou plusieurs objets.');
}

$(document).on('change', '#choose-svg-file', function (event) {
    var files = event.target.files;
    for (var i = 0, file; file = files[i]; ++i) {
        (function (file) {
            var alert = showAlert("Chargement " + file.name, "alert-info", false);
            var reader = new FileReader();
            reader.onload = function (e) {
                loadSvg(alert, file.name, e.target.result);
            };
            reader.onabort = function (e) {
                alert.remove();
                showAlert("Abandonné slisez " + file.name, "alert-danger");
            };
            reader.onerror = function (e) {
                alert.remove();
                showAlert("Erreur lisez " + file.name, "alert-danger");
            };
            reader.readAsText(file);
        })(file);
    }
    $(event.target).replaceWith(control = $(event.target).clone(true));
});

function openSvgDropbox() {
    Dropbox.choose({
        success: function (files) {
            var alert = showAlert("Chargement de " + files[0].name, "alert-info", false);
            $.get(files[0].link, function (content) {
                loadSvg(alert, files[0].name, content);
            }, "text").fail(function () {
                alert.remove();
                showAlert("Chargement " + files[0].name + " échoué", "alert-danger");
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
            tutorial(3, 'Cliquez sur "Créer une opération" après avoir sélectionné les objets.');
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

popoverHover('#pxPerInch', "bottom", "Les éditeurs SVG utilisent des échelles différentes les unes et les autres; régler ceci pour permettre aux tailles de sortir correctement et de correspondre.<br><br><table><tr><td>Inkscape 0.9x:<td>96<tr><td>Inkscape 0.4x:<td>90<tr><td>Adobe Illustrator:<td>72<tr><td>CorelDRAW:<td>96</table>");

popoverHover('#tabsMaxCutDepth', "right", "Les opérations de profondeur maximale peuvent être coupées lorsqu'elles passent au-dessus des onglets");

popoverHover('#toolDiameter', "right", "Diamètre de l'outil. V Pocket ignore cela. Simuler GCODE ignore également Diamètre si Angle <180.");
popoverHover('#toolAngle', "right", "Angle de coupe en V. 180 pour les fraises normales (à fond plat). V Pocket est la seule opération qui obéit à cela. Simuler GCODE obéit toujours.");
popoverHover('#toolPassDepth', "right", "La profondeur maximale dont l'outil doit plonger à chaque passe.Utilisez une profondeur de passe plus petite pour les matériaux plus durs et une meilleure qualité.");
popoverHover('#toolStepOver', "right", "Quelle fraction du diamètre de l'outil l'outil doit franchir à chaque fois autour d'une boucle. Les petites valeurs produisent de meilleures coupes et réduisent l'usure des outils, mais prennent plus de temps à compléter.");
popoverHover('#toolRapidRate', "right", "La vitesse de déplacement de l'outil sans couper (dans le vide)");
popoverHover('#toolPlungeRate', "right", "La vitesse de l'outil quand il plonge vers le bas dans le matériau");
popoverHover('#toolCutRate', "right", "La vitesse de déplacement horizontal de l'outil pendant la coupe");

popoverHover('#inputMatThickness', "top", "Quelle est l'épaisseur du matériau");
popoverHover('#selectMatZOrigin', "top", "Qu'est-ce qui est considéré comme la position 0 sur l'axe des Z");
popoverHover('#inputMatClearance', "top", "Quelle est la hauteur de l'outil sur le matériau. Augmentez cette valeur lorsque vous utilisez des pinces ou des vis pour fixer le matériau.");

popoverHover('#inputSelMinNumSegments', "top", "Nombre minimal de segments de ligne pour convertir une courbe en. jscut effectue cette conversion lorsque vous sélectionnez un objet (il devient bleu).");
popoverHover('#inputSelMinSegmentLength', "top", "Longueur minimale de chaque segment de ligne lors de la conversion de courbes. jscut effectue cette conversion lorsque vous sélectionnez un objet (il devient bleu).");

popoverHover('#gcodeZeroLowerLeft', "top", "Modifie les valeurs de décalage X et Y de sorte que 0,0 se trouve dans le coin inférieur gauche de tous les chemins d'outils.");
popoverHover('#gcodeZeroCenter', "top", "Modifie les valeurs de décalage X et Y de sorte que 0,0 soit au centre de tous les trajets d'outil.");
popoverHover('#gcodeReturn00', "top", "Déplacez l'outil sur 0,0 après la dernière opération.");
popoverHover('#gcodeOffsetX', "top", "Valeur à ajouter aux coordonnées X du gcode");
popoverHover('#gcodeOffsetY', "top", "Valeur à ajouter aux coordonnées Y du gcode");
popoverHover('#gcodeMinX', "top", "Coordonnée X maximale dans gcode. Si cela est hors de portée de votre machine, réglez X Offset.");
popoverHover('#gcodeMaxX', "top", "Coordonnée X maximale dans gcode. Si cela est hors de portée de votre machine, réglez X Offset.");
popoverHover('#gcodeMinY', "top", "Coordonnée Y maximale dans gcode. Si cela est hors de portée de votre machine, réglez Y Offset.");
popoverHover('#gcodeMaxY', "top", "Coordonnée Y maximale dans gcode. Si cela est hors de portée de votre machine, réglez Y Offset.");

var operationPopovers = {
    opEnabled: ['top', 'Si cette opération est activée'],
    opOperation: ['top', 'Quel type d\'opération effectuer'],
    opGenerate: ['top', 'Générer un parcours d\'outil pour l\'opération'],
    opShowDetail: ['top', 'Afficher les détails supplémentaires'],
    opName: ['right', 'Nom utilisé dans les commentaires gcode'],
    opRamp: ['right', 'Rampre progressivement le couteau au lieu de plonger vers le bas'],
    opCombine: ['right', 'Comment combiner plusieurs objets dans cette opération'],
    opDirection: ['right', 'Dans quelle direction le couteau doit-il se déplacer'],
    opCutDepth: ['top', 'Quelle profondeur cette opération devrait couper au total'],
    opVMaxDepth: ['right', "Profondeur maximale de cette opération devrait couper. <p class = 'bg-danger'> pas encore implémenté; ceci est ignoré. </ p>"],
    opMargin: ['right', 'Positif: combien de matière à laisser non coupée. <br> <br> Négatif: combien de matière supplémentaire à couper'],
    opWidth: ['right', 'Quelle largeur de chemin à couper. Si cette largeur est inférieure à la largeur de la fraise, elle utilise la largeur de la fraise.'],
}

var tabPopovers = {
    tabEnabled: ['top', 'Si cet onglet est activé'],
    tabMargin: ['top', 'Positif: combien pour agrandir l\'onglet. <br> <br> Négatif: combien pour réduire l\'onglet.'],
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
    content: "<p class='bg-danger'>Sélectionnez 1 ou plusieurs objets dans l'onglet \"Modifier les parcours d'outils \" avant de cliquer ici</p>",
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

                        var alert = showAlert("Chargement " + name, "alert-info", false);
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
                                    showAlert("Chargement " + name + " échoué", "alert-danger");
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
        showAlert('Cliquez sur "Générer Gcode" avant !', "alert-danger");
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
    var alert = showAlert("Chargement des paramètres depuis le stockage local", "alert-info", false);
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
    showAlert('Effacer "' + miscViewModel.loadLocalStorageFilename() + '" à partir du stockage local', "alert-info");
}

function saveSettingsLocalStorage(callback) {
    var alert = showAlert("Enregistrement des paramètres dans le stockage local", "alert-info", false);
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
        showAlert('Cliquez sur "Générer Gcode" pour commencer', "alert-danger");
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
    var alert = showAlert("Sauvegarde d'un Gist anonyme", "alert-info", false);
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
        showAlert("Gist anonyme enregistré", "alert-success");
        $('#save-gist-warning').modal('hide');
        $('#save-gist-result').modal('show');
        miscViewModel.savedGistUrl(content.html_url);
        miscViewModel.savedGistLaunchUrl("http://jscut.org/jscut.html?gist="+content.id);
    })
    .fail(function (e) {
        alert.remove();
        showAlert("Impossible de sauvegarder Gist annonyme: " + e.responseText, "alert-danger");
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
                showAlert("Aucun fichier trouvé dans gist", "alert-info");
            else if (otherFiles.length == 0)
                showAlert("Aucun fichier trouvé dans gist", "alert-danger");
            else if (otherFiles.length == 1)
                jscutFiles = otherFiles;
            else
                showAlert("Aucun fichier .jscut ou fichier .svg trouvé dans gist", "alert-danger");
        } else if (jscutFiles.length > 1)
            showAlert("Plusieurs fichiers .jscut trouvés; les ignorer", "alert-danger");

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
            showAlert("Impossible d'obtenir l'utilisateur actuel de http://chilipeppr.com/", "alert-danger");
        else if (content.CurrentUser == null)
            showAlert("Non connecté à http://chilipeppr.com/", "alert-danger");
        else if (typeof content.CurrentUser.ID === "undefined")
            showAlert("Impossible d'obtenir l'utilisateur actuel de http://chilipeppr.com/", "alert-danger");
        else
            callback(content.CurrentUser.ID);
    })
    .fail(function (e) {
        showAlert("Impossible d'obtenir l'utilisateur actuel de http://chilipeppr.com/", "alert-danger");
    });
}

function chiliSaveGcode() {
    var key = 'org-jscut-gcode-' + gcodeConversionViewModel.gcodeFilename();
    chiliGetUser(function (userId) {
        var alert = showAlert("Envoi du gcode à chilipeppr.com", "alert-info", false);
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
                showAlert("Impossible d'enregistrer le gcode dans http://chilipeppr.com/", "alert-danger");
        })
        .fail(function (e) {
            alert.remove();
            showAlert("Impossible d'enregistrer le gcode dans http://chilipeppr.com/", "alert-danger");
        });
    });
}

if (typeof options.preloadInBrowser == 'string' && options.preloadInBrowser.length > 0) {
    var settings = JSON.parse(localStorage.getItem("settings"));
    fromJson(settings[options.preloadInBrowser]);
}
