// jscut reads options from config.js. There are 2 versions in the Git repository:
//      config.js               Used when deploying to jscut.org.
//      config_standalone.js    This gets renamed to config.js when jscut_standalone.tar.gz is generated.

var options = {
    // Attempt to fetch cam-cpp.js from these locations in order.
    // 'js' works in the standalone version, but not the version hosted at jscut.org
    // (the file is too big to be hosted there). 'js' also works locally if you run
    // 'make' from a Git clone. 'http://api.jscut.org/js' works whenever network
    // access is available.
    //
    // Caution: 'http://api.jscut.org/js' stays in sync with http://jscut.org/ ;
    // it is often incompatible with older jscut clones and snapshots.
    //
    // Caution: never check the following files into Git or bad things happen:
    //      js/cam-cpp.js
    //      js/cam-cpp.js.mem
    camCppPaths: ['js', 'http://api.jscut.org/js'],

    // Enable Google Drive integration?
    // This only works when the app is served directly from jscut.org.
    enableGoogleDrive: true,

    // Enable Dropbox integration?
    // This only works when the app is served directly from jscut.org.
    enableDropbox: true,

    // Debug run times
    profile: false,

    // Other debugging support
    debug: false,

    // Preload in-browser settings file.
    preloadInBrowser: 'preload.jscut',
};
