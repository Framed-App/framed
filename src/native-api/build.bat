REM "node-gyp rebuild" didn't work for some reason
node-gyp clean && ^
node-gyp configure --target=16.0.3 --arch=x64 && ^
node-gyp rebuild --target=16.0.3 --arch=x64 --dist-url=https://electronjs.org/headers --msvs_version=2017