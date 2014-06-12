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
    var self = this;
    var resolution = 1024;
    self.cutterDia = .125 / 4;
    var pathXOffset = 0;
    var pathYOffset = 0;
    var pathXYScale = 1;
    var pathMinZ = -1;
    var pathTopZ = 0;

    self.gl = null;

    try {
        self.gl = canvas.getContext("webgl");
    } catch (e) {
    }

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
    var pathProgram;

    function linkPrograms() {
        pathProgram = self.gl.createProgram();
        self.gl.attachShader(pathProgram, rasterizePathVertexShader);
        self.gl.attachShader(pathProgram, rasterizePathFragmentShader);
        self.gl.linkProgram(pathProgram);

        if (!self.gl.getProgramParameter(pathProgram, self.gl.LINK_STATUS)) {
            alert("Could not initialise shaders");
        }

        self.gl.useProgram(pathProgram);

        pathProgram.pos1 = self.gl.getAttribLocation(pathProgram, "pos1");
        self.gl.enableVertexAttribArray(pathProgram.pos1);

        pathProgram.pos2 = self.gl.getAttribLocation(pathProgram, "pos2");
        self.gl.enableVertexAttribArray(pathProgram.pos2);

        pathProgram.vertex = self.gl.getAttribLocation(pathProgram, "vertex");
        self.gl.enableVertexAttribArray(pathProgram.vertex);

        pathProgram.resolution = self.gl.getUniformLocation(pathProgram, "resolution");
        pathProgram.cutterDia = self.gl.getUniformLocation(pathProgram, "cutterDia");
        pathProgram.pathXYOffset = self.gl.getUniformLocation(pathProgram, "pathXYOffset");
        pathProgram.pathXYScale = self.gl.getUniformLocation(pathProgram, "pathXYScale");
        pathProgram.pathMinZ = self.gl.getUniformLocation(pathProgram, "pathMinZ");
        pathProgram.pathTopZ = self.gl.getUniformLocation(pathProgram, "pathTopZ");
    }

    function loadedShader() {
        if (!rasterizePathVertexShader || !rasterizePathFragmentShader)
            return;
        linkPrograms();
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

    var pathBuffer;
    var pathNumPoints = 0;
    var pathStride = 7;
    var pathVertexesPerLine = 18;
    var pathNumVertexes = 0;

    self.fillPathBuffer = function (path) {
        if (!pathBuffer)
            pathBuffer = self.gl.createBuffer();
        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, pathBuffer);
        pathNumPoints = path.length / 3;
        pathNumVertexes = pathNumPoints * pathVertexesPerLine;
        var bufferContent = new Float32Array(pathNumPoints * pathStride * pathVertexesPerLine);

        var minX = path[0];
        var maxX = path[0];
        var minY = path[1];
        var maxY = path[1];
        var minZ = path[2];

        for (var point = 0; point < pathNumPoints; ++point) {
            minX = Math.min(minX, path[point * 3 + 0]);
            maxX = Math.max(maxX, path[point * 3 + 0]);
            minY = Math.min(minY, path[point * 3 + 1]);
            maxY = Math.max(maxY, path[point * 3 + 1]);
            minZ = Math.min(minZ, path[point * 3 + 2]);
            var prevPoint = Math.max(point - 1, 0);
            for (var virtex = 0; virtex < pathVertexesPerLine; ++virtex) {
                var base = point * pathStride * pathVertexesPerLine + virtex * pathStride;
                bufferContent[base + 0] = path[prevPoint * 3 + 0];
                bufferContent[base + 1] = path[prevPoint * 3 + 1];
                bufferContent[base + 2] = path[prevPoint * 3 + 2];
                bufferContent[base + 3] = path[point * 3 + 0];
                bufferContent[base + 4] = path[point * 3 + 1];
                bufferContent[base + 5] = path[point * 3 + 2];
                bufferContent[base + 6] = virtex;
            }
        }
        self.gl.bufferData(self.gl.ARRAY_BUFFER, bufferContent, self.gl.STATIC_DRAW);

        pathXOffset = -(minX + maxX) / 2;
        pathYOffset = -(minY + maxY) / 2;
        var size = Math.max(maxX - minX + 4 * self.cutterDia, maxY - minY + 4 * self.cutterDia);
        pathXYScale = 2 / size;
        pathMinZ = minZ;
    }

    self.drawPath = function () {
        self.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        //self.gl.disable(renderPath.gl.DEPTH_TEST);
        self.gl.viewport(0, 0, resolution, resolution);
        self.gl.clear(self.gl.COLOR_BUFFER_BIT | self.gl.DEPTH_BUFFER_BIT);

        self.gl.uniform1f(pathProgram.resolution, resolution);
        self.gl.uniform1f(pathProgram.cutterDia, self.cutterDia);
        self.gl.uniform2f(pathProgram.pathXYOffset, pathXOffset, pathYOffset);
        self.gl.uniform1f(pathProgram.pathXYScale, pathXYScale);
        self.gl.uniform1f(pathProgram.pathMinZ, pathMinZ);
        self.gl.uniform1f(pathProgram.pathTopZ, pathTopZ);
        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, pathBuffer);
        self.gl.vertexAttribPointer(pathProgram.pos1, 3, self.gl.FLOAT, false, pathStride * Float32Array.BYTES_PER_ELEMENT, 0);
        self.gl.vertexAttribPointer(pathProgram.pos2, 3, self.gl.FLOAT, false, pathStride * Float32Array.BYTES_PER_ELEMENT, 3 * Float32Array.BYTES_PER_ELEMENT);
        self.gl.vertexAttribPointer(pathProgram.vertex, 1, self.gl.FLOAT, false, pathStride * Float32Array.BYTES_PER_ELEMENT, 6 * Float32Array.BYTES_PER_ELEMENT);

        self.gl.drawArrays(self.gl.TRIANGLES, 0, pathNumVertexes);
    }

    var pathFramebuffer = null;
    var pathRgbaTexture = null;

    self.createPathTexture = function () {
        if (!pathFramebuffer) {
            pathFramebuffer = self.gl.createFramebuffer();
            self.gl.bindFramebuffer(self.gl.FRAMEBUFFER, pathFramebuffer);

            pathRgbaTexture = self.gl.createTexture();
            self.gl.bindTexture(self.gl.TEXTURE_2D, pathRgbaTexture);
            self.gl.texImage2D(self.gl.TEXTURE_2D, 0, self.gl.RGBA, resolution, resolution, 0, self.gl.RGBA, self.gl.UNSIGNED_BYTE, null);
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

    var meshStride = 7;
    var meshNumVertexes = 0;

    if (self.gl) {
        var numTriangles = resolution * (resolution - 1);
        meshNumVertexes = numTriangles * 3;
        var bufferContent = new Float32Array(meshNumVertexes * meshStride);
        var pos = 0;
        for (var y = 0; y < resolution - 2; ++y)
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
                        bufferContent[pos++] = i;
                    }
            }
    }
}

var canvas;
var renderPath;

function webGLStart() {
    canvas = document.getElementById("canvas");
    renderPath = new RenderPath(canvas, function () {
        $.get("logo-gcode.txt", function (gcode) {
            path = parseGcode(gcode);
            renderPath.fillPathBuffer(path);
            renderPath.createPathTexture();
            renderPath.drawPath();
        });
    });
}
