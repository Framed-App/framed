var addon;

try {
	addon = require('./build/Release/framedNative.node');
} catch (err) {
	console.error(err);
	addon = require('./build/Debug/framedNative.node');
}

if (!addon) {
	throw new Error('Could not load native code');
}

// Don't allow direct access to native module functions
function getPerfData() {
	return new Promise((resolve) => {
		resolve(addon.getPerfData());
	});
}

//console.log(getPerfData());

module.exports.getPerfData = getPerfData;