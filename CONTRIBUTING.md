# Contributing

Firstly, thanks for contributing to Framed. Your contributions might just help your favourite streamer in the future.

## Dev Environment

To contribute to Framed, you will need to configure your development environment as follows:

- The usual requirements (see README.md)
- Node.js v16
- Install all dependecies in `package.json`, including dev dependencies
- `node-gyp` v8
- Visual Studio 2017 build tools

You will need to build the native API module (`src/native-api/native-api.cpp`). Copy `json.hpp` from `nlohmann/json` v3.10.4 into `src/native-api/lib/nlohmann` and its license to `license.txt` in the same directory. A build script has been included in that directory.

Also run `npm run create-about` to create the data for the about and licenses windows. Run this script again if you install anything from npm, it should automatically find the required data. If you add any code not from npm, please add the necessary data in `src/ui/js/renderer/additional/about/_createAbout.js`.

If the above was successful, you can start Framed by running `npm start`.

For security reasons, `BrowserWindow`s do not have access to the Node.js API, nor the main event emitters. Instead, the necessary event emitters (and Node.js modules, where required) are defined in the preload files (`src/ui/js/preload/`) to make them available to the `BrowserWindow`s. Ensure that the preload files give access to the minimum required to implement a feature, and that **every** event/function is separate (e.g. don't blindly pass events to the IPC, instead define every event individually).

Framed makes extensive use of event emitters. A main event emitter is passed to different parts of the app, and should be used whenever different parts of the app need to communicate. However, if there are events that **only** run in one file, implement an internal event emitter for that file.

Users can save the data Framed collects to a `.frd` file for reviewing later. To ensure only valid files are loaded, validator functions are used. If you modify the format of this file, create a new validator file in `src/frd-validator`. You will also need to update the code that loads `.frd` files. **Please keep backwards compatibility in mind**.

As the whole purpose of Framed is to help streamers detect the cause of dropped frames, the code should be written in a way that doesn't affect streaming. Ensure that the code does not cause unnecessary resource usage. Write C++ modules where appropriate, run anything that could lag out Framed (such as long-running tasks) on it's own thread (using Node.js' `child_process.fork()` and it's built-in IPC).