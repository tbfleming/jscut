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

function RenderPath(canvas, shadersReady) {
    "use strict";
    var self = this;
    var resolution = 1024;
    self.cutterDia = .125;
    var pathXOffset = 0;
    var pathYOffset = 0;
    var pathXYScale = 1;
    var pathMinZ = -1;
    var pathTopZ = 0;
    self.stopAtTime = 9999999;
    self.rotate = mat4.create();

    self.gl = WebGLUtils.setupWebGL(canvas);

    function loadShader(filename, type, callback) {
        if (self.gl)
            $.get(filename, function (source) {
                var shader = self.gl.createShader(type);
                self.gl.shaderSource(shader, source);
                self.gl.compileShader(shader);
                if (self.gl.getShaderParameter(shader, self.gl.COMPILE_STATUS))
                    callback(shader);
                else
                    alert(self.gl.getShaderInfoLog(shader));
            });
    }

    var rasterizePathVertexShader;
    var rasterizePathFragmentShader;
    var rasterizePathProgram;

    function linkRasterizePathProgram() {
        rasterizePathProgram = self.gl.createProgram();
        self.gl.attachShader(rasterizePathProgram, rasterizePathVertexShader);
        self.gl.attachShader(rasterizePathProgram, rasterizePathFragmentShader);
        self.gl.linkProgram(rasterizePathProgram);

        if (!self.gl.getProgramParameter(rasterizePathProgram, self.gl.LINK_STATUS)) {
            alert("Could not initialise RasterizePath shaders");
        }

        self.gl.useProgram(rasterizePathProgram);

        rasterizePathProgram.resolution = self.gl.getUniformLocation(rasterizePathProgram, "resolution");
        rasterizePathProgram.cutterDia = self.gl.getUniformLocation(rasterizePathProgram, "cutterDia");
        rasterizePathProgram.pathXYOffset = self.gl.getUniformLocation(rasterizePathProgram, "pathXYOffset");
        rasterizePathProgram.pathXYScale = self.gl.getUniformLocation(rasterizePathProgram, "pathXYScale");
        rasterizePathProgram.pathMinZ = self.gl.getUniformLocation(rasterizePathProgram, "pathMinZ");
        rasterizePathProgram.pathTopZ = self.gl.getUniformLocation(rasterizePathProgram, "pathTopZ");
        rasterizePathProgram.stopAtTime = self.gl.getUniformLocation(rasterizePathProgram, "stopAtTime");
        rasterizePathProgram.pos1 = self.gl.getAttribLocation(rasterizePathProgram, "pos1");
        rasterizePathProgram.pos2 = self.gl.getAttribLocation(rasterizePathProgram, "pos2");
        rasterizePathProgram.startTime = self.gl.getAttribLocation(rasterizePathProgram, "startTime");
        rasterizePathProgram.endTime = self.gl.getAttribLocation(rasterizePathProgram, "endTime");
        rasterizePathProgram.vertex = self.gl.getAttribLocation(rasterizePathProgram, "vertex");

        self.gl.useProgram(null);
    }

    var renderHeightMapVertexShader;
    var renderHeightMapFragmentShader;
    var renderHeightMapProgram;

    function linkRenderHeightMapProgram() {
        renderHeightMapProgram = self.gl.createProgram();
        self.gl.attachShader(renderHeightMapProgram, renderHeightMapVertexShader);
        self.gl.attachShader(renderHeightMapProgram, renderHeightMapFragmentShader);
        self.gl.linkProgram(renderHeightMapProgram);

        if (!self.gl.getProgramParameter(renderHeightMapProgram, self.gl.LINK_STATUS)) {
            alert("Could not initialise RenderHeightMap shaders");
        }

        self.gl.useProgram(renderHeightMapProgram);

        renderHeightMapProgram.resolution = self.gl.getUniformLocation(renderHeightMapProgram, "resolution");
        //renderHeightMapProgram.pathXYScale = self.gl.getUniformLocation(renderHeightMapProgram, "pathXYScale");
        //renderHeightMapProgram.pathMinZ = self.gl.getUniformLocation(renderHeightMapProgram, "pathMinZ");
        //renderHeightMapProgram.pathTopZ = self.gl.getUniformLocation(renderHeightMapProgram, "pathTopZ");
        renderHeightMapProgram.rotate = self.gl.getUniformLocation(renderHeightMapProgram, "rotate");
        renderHeightMapProgram.heightMap = self.gl.getUniformLocation(renderHeightMapProgram, "heightMap");
        renderHeightMapProgram.pos0 = self.gl.getAttribLocation(renderHeightMapProgram, "pos0");
        renderHeightMapProgram.pos1 = self.gl.getAttribLocation(renderHeightMapProgram, "pos1");
        renderHeightMapProgram.pos2 = self.gl.getAttribLocation(renderHeightMapProgram, "pos2");
        renderHeightMapProgram.thisPos = self.gl.getAttribLocation(renderHeightMapProgram, "thisPos");
        //renderHeightMapProgram.vertex = self.gl.getAttribLocation(renderHeightMapProgram, "vertex");

        self.gl.useProgram(null);
    }

    function loadedShader() {
        if (!rasterizePathVertexShader || !rasterizePathFragmentShader || !renderHeightMapVertexShader || !renderHeightMapFragmentShader)
            return;
        linkRasterizePathProgram();
        linkRenderHeightMapProgram();
        shadersReady();
    }

    loadShader("js/rasterizePathVertexShader.txt", self.gl.VERTEX_SHADER, function (shader) {
        rasterizePathVertexShader = shader;
        loadedShader();
    });

    loadShader("js/rasterizePathFragmentShader.txt", self.gl.FRAGMENT_SHADER, function (shader) {
        rasterizePathFragmentShader = shader;
        loadedShader();
    });

    loadShader("js/renderHeightMapVertexShader.txt", self.gl.VERTEX_SHADER, function (shader) {
        renderHeightMapVertexShader = shader;
        loadedShader();
    });

    loadShader("js/renderHeightMapFragmentShader.txt", self.gl.FRAGMENT_SHADER, function (shader) {
        renderHeightMapFragmentShader = shader;
        loadedShader();
    });

    var pathBuffer;
    var pathNumPoints = 0;
    var pathStride = 9;
    var pathVertexesPerLine = 18;
    var pathNumVertexes = 0;
    self.totalTime = 0;

    self.fillPathBuffer = function (path) {
        var inputStride = 4;
        pathNumPoints = path.length / inputStride;
        pathNumVertexes = pathNumPoints * pathVertexesPerLine;
        var bufferContent = new Float32Array(pathNumPoints * pathStride * pathVertexesPerLine);

        var minX = path[0];
        var maxX = path[0];
        var minY = path[1];
        var maxY = path[1];
        var minZ = path[2];

        var time = 0;
        for (var point = 0; point < pathNumPoints; ++point) {
            var prevPoint = Math.max(point - 1, 0);
            var pointBegin = point * inputStride;
            var prevPointBegin = prevPoint * inputStride;
            var x = path[pointBegin + 0];
            var y = path[pointBegin + 1];
            var z = path[pointBegin + 2];
            var f = path[pointBegin + 3];
            var prevX = path[prevPointBegin + 0];
            var prevY = path[prevPointBegin + 1];
            var prevZ = path[prevPointBegin + 2];
            var dist = Math.sqrt((x - prevX) * (x - prevX) + (y - prevY) * (y - prevY) + (z - prevZ) * (z - prevZ));
            var beginTime = time;
            time = time + dist / f * 60;

            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            minZ = Math.min(minZ, z);

            for (var virtex = 0; virtex < pathVertexesPerLine; ++virtex) {
                var base = point * pathStride * pathVertexesPerLine + virtex * pathStride;
                bufferContent[base + 0] = prevX;
                bufferContent[base + 1] = prevY;
                bufferContent[base + 2] = prevZ;
                bufferContent[base + 3] = x;
                bufferContent[base + 4] = y;
                bufferContent[base + 5] = z;
                bufferContent[base + 6] = beginTime;
                bufferContent[base + 7] = time;
                bufferContent[base + 8] = virtex;
            }
        }
        self.totalTime = time;

        if (!pathBuffer)
            pathBuffer = self.gl.createBuffer();
        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, pathBuffer);
        self.gl.bufferData(self.gl.ARRAY_BUFFER, bufferContent, self.gl.STATIC_DRAW);
        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, null);

        pathXOffset = -(minX + maxX) / 2;
        pathYOffset = -(minY + maxY) / 2;
        var size = Math.max(maxX - minX + 4 * self.cutterDia, maxY - minY + 4 * self.cutterDia);
        pathXYScale = 2 / size;
        pathMinZ = minZ;
    }

    self.drawPath = function () {
        self.gl.useProgram(rasterizePathProgram);
        self.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        self.gl.disable(renderPath.gl.DEPTH_TEST);
        self.gl.viewport(0, 0, resolution, resolution);
        self.gl.clear(self.gl.COLOR_BUFFER_BIT | self.gl.DEPTH_BUFFER_BIT);

        self.gl.uniform1f(rasterizePathProgram.resolution, resolution);
        self.gl.uniform1f(rasterizePathProgram.cutterDia, self.cutterDia);
        self.gl.uniform2f(rasterizePathProgram.pathXYOffset, pathXOffset, pathYOffset);
        self.gl.uniform1f(rasterizePathProgram.pathXYScale, pathXYScale);
        self.gl.uniform1f(rasterizePathProgram.pathMinZ, pathMinZ);
        self.gl.uniform1f(rasterizePathProgram.pathTopZ, pathTopZ);
        self.gl.uniform1f(rasterizePathProgram.stopAtTime, self.stopAtTime);
        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, pathBuffer);
        self.gl.vertexAttribPointer(rasterizePathProgram.pos1, 3, self.gl.FLOAT, false, pathStride * Float32Array.BYTES_PER_ELEMENT, 0);
        self.gl.vertexAttribPointer(rasterizePathProgram.pos2, 3, self.gl.FLOAT, false, pathStride * Float32Array.BYTES_PER_ELEMENT, 3 * Float32Array.BYTES_PER_ELEMENT);
        self.gl.vertexAttribPointer(rasterizePathProgram.startTime, 1, self.gl.FLOAT, false, pathStride * Float32Array.BYTES_PER_ELEMENT, 6 * Float32Array.BYTES_PER_ELEMENT);
        self.gl.vertexAttribPointer(rasterizePathProgram.endTime, 1, self.gl.FLOAT, false, pathStride * Float32Array.BYTES_PER_ELEMENT, 7 * Float32Array.BYTES_PER_ELEMENT);
        self.gl.vertexAttribPointer(rasterizePathProgram.vertex, 1, self.gl.FLOAT, false, pathStride * Float32Array.BYTES_PER_ELEMENT, 8 * Float32Array.BYTES_PER_ELEMENT);

        self.gl.enableVertexAttribArray(rasterizePathProgram.pos1);
        self.gl.enableVertexAttribArray(rasterizePathProgram.pos2);
        self.gl.enableVertexAttribArray(rasterizePathProgram.startTime);
        self.gl.enableVertexAttribArray(rasterizePathProgram.endTime);
        self.gl.enableVertexAttribArray(rasterizePathProgram.vertex);
        self.gl.drawArrays(self.gl.TRIANGLES, 0, pathNumVertexes);
        self.gl.disableVertexAttribArray(rasterizePathProgram.pos1);
        self.gl.disableVertexAttribArray(rasterizePathProgram.pos2);
        self.gl.disableVertexAttribArray(rasterizePathProgram.startTime);
        self.gl.disableVertexAttribArray(rasterizePathProgram.endTime);
        self.gl.disableVertexAttribArray(rasterizePathProgram.vertex);

        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, null);
        self.gl.useProgram(null);
    }

    var pathFramebuffer = null;
    var pathRgbaTexture = null;

    self.createPathTexture = function () {
        if (!pathFramebuffer) {
            pathFramebuffer = self.gl.createFramebuffer();
            self.gl.bindFramebuffer(self.gl.FRAMEBUFFER, pathFramebuffer);

            pathRgbaTexture = self.gl.createTexture();
            self.gl.activeTexture(self.gl.TEXTURE0);
            self.gl.bindTexture(self.gl.TEXTURE_2D, pathRgbaTexture);
            self.gl.texImage2D(self.gl.TEXTURE_2D, 0, self.gl.RGBA, resolution, resolution, 0, self.gl.RGBA, self.gl.UNSIGNED_BYTE, null);
            self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_MAG_FILTER, self.gl.NEAREST);
            self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_MIN_FILTER, self.gl.NEAREST);
            self.gl.framebufferTexture2D(self.gl.FRAMEBUFFER, self.gl.COLOR_ATTACHMENT0, self.gl.TEXTURE_2D, pathRgbaTexture, 0);
            self.gl.bindTexture(self.gl.TEXTURE_2D, null);

            var renderbuffer = self.gl.createRenderbuffer();
            self.gl.bindRenderbuffer(self.gl.RENDERBUFFER, renderbuffer);
            self.gl.renderbufferStorage(self.gl.RENDERBUFFER, self.gl.DEPTH_COMPONENT16, resolution, resolution);
            self.gl.framebufferRenderbuffer(self.gl.FRAMEBUFFER, self.gl.DEPTH_ATTACHMENT, self.gl.RENDERBUFFER, renderbuffer);
            self.gl.bindRenderbuffer(self.gl.RENDERBUFFER, null);
            
            self.gl.bindFramebuffer(self.gl.FRAMEBUFFER, null);
        }
        self.gl.bindFramebuffer(self.gl.FRAMEBUFFER, pathFramebuffer);
        self.drawPath();
        self.gl.bindFramebuffer(self.gl.FRAMEBUFFER, null);
    }

    var meshBuffer;
    var meshStride = 9;
    var meshNumVertexes = 0;

    if (self.gl) {
        var numTriangles = resolution * (resolution - 1);
        meshNumVertexes = numTriangles * 3;
        var bufferContent = new Float32Array(meshNumVertexes * meshStride);
        var pos = 0;
        for (var y = 0; y < resolution - 1; ++y)
            for (var x = 0; x < resolution; ++x) {
                var left = x - 1;
                if (left < 0)
                    left = 0;
                var right = x + 1;
                if (right >= resolution)
                    right = resolution - 1;
                if (!(x & 1) ^ (y & 1))
                    for (var i = 0; i < 3; ++i) {
                        bufferContent[pos++] = left;
                        bufferContent[pos++] = y + 1;
                        bufferContent[pos++] = x;
                        bufferContent[pos++] = y;
                        bufferContent[pos++] = right;
                        bufferContent[pos++] = y + 1;
                        if (i == 0) {
                            bufferContent[pos++] = left;
                            bufferContent[pos++] = y + 1;
                        } else if (i == 1) {
                            bufferContent[pos++] = x;
                            bufferContent[pos++] = y;
                        }
                        else {
                            bufferContent[pos++] = right;
                            bufferContent[pos++] = y + 1;
                        }
                        bufferContent[pos++] = i;
                    }
                else
                    for (var i = 0; i < 3; ++i) {
                        bufferContent[pos++] = left;
                        bufferContent[pos++] = y;
                        bufferContent[pos++] = right;
                        bufferContent[pos++] = y;
                        bufferContent[pos++] = x;
                        bufferContent[pos++] = y + 1;
                        if (i == 0) {
                            bufferContent[pos++] = left;
                            bufferContent[pos++] = y;
                        } else if (i == 1) {
                            bufferContent[pos++] = right;
                            bufferContent[pos++] = y;
                        }
                        else {
                            bufferContent[pos++] = x;
                            bufferContent[pos++] = y + 1;
                        }
                        bufferContent[pos++] = i;
                    }
            }

        //bufferContent = new Float32Array([
        //    1,1,126,1,64,126,    0,
        //    1,1,126,1,64,126,    1,
        //    1,1,126,1,64,126,    2,
        //]);
        //meshNumVertexes = 3;

        meshBuffer = self.gl.createBuffer();
        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, meshBuffer);
        self.gl.bufferData(self.gl.ARRAY_BUFFER, bufferContent, self.gl.STATIC_DRAW);
        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, null);
    }

    self.drawHeightMap = function () {
        self.gl.useProgram(renderHeightMapProgram);
        self.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        self.gl.enable(renderPath.gl.DEPTH_TEST);
        self.gl.viewport(0, 0, resolution, resolution);
        self.gl.clear(self.gl.COLOR_BUFFER_BIT | self.gl.DEPTH_BUFFER_BIT);

        self.gl.activeTexture(self.gl.TEXTURE0);
        self.gl.bindTexture(self.gl.TEXTURE_2D, pathRgbaTexture);

        self.gl.uniform1f(renderHeightMapProgram.resolution, resolution);
        //self.gl.uniform1f(renderHeightMapProgram.pathXYScale, pathXYScale);
        //self.gl.uniform1f(renderHeightMapProgram.pathMinZ, pathMinZ);
        //self.gl.uniform1f(renderHeightMapProgram.pathTopZ, pathTopZ);
        self.gl.uniformMatrix4fv(renderHeightMapProgram.rotate, false, self.rotate);
        self.gl.uniform1i(renderHeightMapProgram.heightMap, 0);

        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, meshBuffer);
        self.gl.vertexAttribPointer(renderHeightMapProgram.pos0, 2, self.gl.FLOAT, false, meshStride * Float32Array.BYTES_PER_ELEMENT, 0);
        self.gl.vertexAttribPointer(renderHeightMapProgram.pos1, 2, self.gl.FLOAT, false, meshStride * Float32Array.BYTES_PER_ELEMENT, 2 * Float32Array.BYTES_PER_ELEMENT);
        self.gl.vertexAttribPointer(renderHeightMapProgram.pos2, 2, self.gl.FLOAT, false, meshStride * Float32Array.BYTES_PER_ELEMENT, 4 * Float32Array.BYTES_PER_ELEMENT);
        self.gl.vertexAttribPointer(renderHeightMapProgram.thisPos, 2, self.gl.FLOAT, false, meshStride * Float32Array.BYTES_PER_ELEMENT, 6 * Float32Array.BYTES_PER_ELEMENT);
        //self.gl.vertexAttribPointer(renderHeightMapProgram.vertex, 1, self.gl.FLOAT, false, meshStride * Float32Array.BYTES_PER_ELEMENT, 8 * Float32Array.BYTES_PER_ELEMENT);

        self.gl.enableVertexAttribArray(renderHeightMapProgram.pos0);
        self.gl.enableVertexAttribArray(renderHeightMapProgram.pos1);
        self.gl.enableVertexAttribArray(renderHeightMapProgram.pos2);
        self.gl.enableVertexAttribArray(renderHeightMapProgram.thisPos);
        //self.gl.enableVertexAttribArray(renderHeightMapProgram.vertex);

        self.gl.drawArrays(self.gl.TRIANGLES, 0, meshNumVertexes);

        self.gl.disableVertexAttribArray(renderHeightMapProgram.pos0);
        self.gl.disableVertexAttribArray(renderHeightMapProgram.pos1);
        self.gl.disableVertexAttribArray(renderHeightMapProgram.pos2);
        self.gl.disableVertexAttribArray(renderHeightMapProgram.thisPos);
        //self.gl.disableVertexAttribArray(renderHeightMapProgram.vertex);

        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, null);
        self.gl.bindTexture(self.gl.TEXTURE_2D, null);
        self.gl.useProgram(null);
    }
}

var canvas;
var renderPath;
var timeSlider;

function webGLStart() {
    timeSlider = $('#timeSlider').slider({
        formater: function (value) {
            if (renderPath)
                return 'Time: ' + Math.round(value / 1000 * renderPath.totalTime) + 's';
            else
                return value;
        }
    });

    canvas = document.getElementById("canvas");
    renderPath = new RenderPath(canvas, function () {
        $.get("logo-gcode.txt", function (gcode) {
            path = parseGcode(gcode);
            renderPath.fillPathBuffer(path);
            renderPath.createPathTexture();
            //renderPath.drawPath();
            renderPath.drawHeightMap();

            var mouseDown = false;
            var lastX = 0;
            var lastY = 0;

            var origRotate = mat4.create();
            $(canvas).mousedown(function (e) {
                mouseDown = true;
                lastX = e.pageX;
                lastY = e.pageY;
                mat4.copy(origRotate, renderPath.rotate);
            });

            $(document).mousemove(function (e) {
                if (!mouseDown)
                    return;
                var m = mat4.create();
                mat4.rotateY(m, m, (e.pageX - lastX) / 200);
                mat4.rotateX(m, m, (e.pageY - lastY) / 200);
                mat4.multiply(renderPath.rotate, m, origRotate);
                renderPath.drawHeightMap();
            });

            $(document).mouseup(function (e) {
                mouseDown = false;
            });

            timeSlider.on('slide', function () {
                renderPath.stopAtTime = timeSlider.val() / 1000 * renderPath.totalTime;
                renderPath.createPathTexture();
                renderPath.drawHeightMap();
            });
        });
    });
}
