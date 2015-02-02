SNAPSHOT_FILES =        \
    api                 \
    app.yaml            \
    bower_components    \
    bower.json          \
    CNAME               \
    config.js           \
    COPYING             \
    cpp                 \
    index.html          \
    js                  \
    jscut.css           \
    jscut.html          \
    lib                 \
    logo-both.svg       \
    logo-circle.svg     \
    logo-diff.svg       \
    logo-gcode.txt      \
    logo-text.svg       \
    Makefile            \
    Material.svg        \
    README.md           \
    RenderPath.html     \
    test                \
    test.svg            \
    todo.txt            \

COMPILE_FLAGS =                                     \
    cam.cpp                                         \
    hspocket.cpp                                    \
    separateTabs.cpp                                \
    vEngrave.cpp                                    \
    -I ../../boost_1_56_0                           \
    -std=c++11                                      \
    --memory-init-file 0                            \
    -fcolor-diagnostics                             \
    -Wall                                           \
    -Wextra                                         \
    -Wno-unused-function                            \
    -Wno-unused-parameter                           \
    -Wno-unused-variable                            \
    -Wno-logical-op-parentheses                     \
    -s ASSERTIONS=0                                 \
    -s ALLOW_MEMORY_GROWTH=1                        \
    -s SAFE_HEAP=0                                  \
    -s DISABLE_EXCEPTION_CATCHING=1                 \
    -s FORCE_ALIGNED_MEMORY=1                       \
    -s NO_EXIT_RUNTIME=1                            \
    -s EXPORTED_FUNCTIONS="['_hspocket', '_separateTabs', '_vPocket']" \
    -o ../js/cam-cpp.js                             \

RELEASE_FLAGS =                                     \
    $(COMPILE_FLAGS)                                \
    -O3                                             \
    --llvm-lto 1                                    \

DEBUG_FLAGS =                                       \
    $(COMPILE_FLAGS)                                \
    -O0                                             \
    --llvm-lto 0                                    \

default:
	cd cpp && em++ $(RELEASE_FLAGS)

debug:
	cd cpp && em++ $(DEBUG_FLAGS)

less:
	make debug 2>&1 | less -R

standalone: default
	rm -rf jscut_standalone jscut_standalone.tar.gz
	mkdir jscut_standalone
	cp -a $(SNAPSHOT_FILES) jscut_standalone
	cp -f config_standalone.js jscut_standalone/config.js
	tar czf jscut_standalone.tar.gz jscut_standalone

deploy: standalone
	appcfg.py --oauth2 --noauth_local_webserver update .

clean:
	rm -rf jscut_standalone
	rm -rf jscut_standalone.tar.gz
	rm -rf js/cam-cpp.js
	rm -rf js/cam-cpp.js.mem
