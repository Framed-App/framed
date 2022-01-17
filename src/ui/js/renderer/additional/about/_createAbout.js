const package = require('../../../../../../package.json');
const fs = require('fs');
const path = require('path');


// Add any non-npm licenses here
const ADDITIONAL = {
	json: {
		version: '3.10.4',
		link: 'https://github.com/nlohmann/json',
		license: fs.readFileSync(path.join(__dirname, path.normalize('../../../../../native-api/lib/nlohmann/license.txt'))).toString()
	},
	fontawesome: {
		version: '5.15.4',
		link: 'https://fontawesome.com/',
		license: fs.readFileSync(path.join(__dirname, path.normalize('../../../../css/fontawesome/LICENSE.txt'))).toString()
	},
	chartjs: {
		version: '3.5.1',
		link: 'https://github.com/chartjs/Chart.js',
		license: `The MIT License (MIT)
		
Copyright (c) 2014-2021 Chart.js Contributors
		
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`
	},
	'chartjs-adapter-moment': {
		version: '0.1.1',
		link: 'https://github.com/chartjs/chartjs-adapter-moment',
		license: `The MIT License (MIT)
		
Copyright (c) 2019 Chart.js Contributors
		
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
		
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
		
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`
	},
	// to show the Framed license in the licenses window
	framed: {
		version: package.version,
		link: 'https://framed-app.com',
		license: fs.readFileSync(path.join(__dirname, path.normalize('../../../../../../LICENSE.md'))).toString()
	}
};

var packages = {};

function doCommon(d) {
	var _packageJson = require(path.join(__dirname, path.normalize(`../../../../../../node_modules/${d}/package.json`)));
	packages[d].link = _packageJson.homepage;

	if (!packages[d].link) {
		if (typeof _packageJson.repository === 'object') {
			packages[d].link = _packageJson.repository.url;
		} else if (typeof _packageJson.repository === 'string') {
			try {
				var url = new URL(_packageJson.repository);
				packages[d].link = url.toString();
			} catch (_) {
				if (_packageJson.repository.includes('/') && _packageJson.repository.split('/').length === 2) {
					console.log(`No explicit repository link for ${d}, assuming GitHub`);
					packages[d].link = `https://github.com/${_packageJson.repository}`;
				} else {
					console.error(`Failed to determine URL for ${d}. Repository string: ${_packageJson.repository}`);
				}
			}
		}
	}

	var tryFiles = ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'license.txt'];

	for (var i = 0; i < tryFiles.length; i++) {
		let tryFile = tryFiles[i];
		if (fs.existsSync(path.join(__dirname, path.normalize(`../../../../../../node_modules/${d}/${tryFile}`)))) {
			packages[d].license = fs.readFileSync(path.join(__dirname, path.normalize(`../../../../../../node_modules/${d}/${tryFile}`))).toString();
		}
	}
}

for (var d in package.dependencies) {
	packages[d] = {
		version: package.dependencies[d]
	};

	doCommon(d);
}

for (var dv in package.devDependencies) {
	packages[dv] = {
		version: package.devDependencies[dv]
	};

	doCommon(dv);
}

for (var p in packages) {
	if (!packages[p].link) {
		console.error(`Link for ${p} missing`);
	}

	if (!packages[p].license) {
		console.error(`License for ${p} missing`);
	}
}

packages = {
	...packages,
	...ADDITIONAL
};

fs.writeFileSync(path.join(__dirname, 'about.config.js'),
	`const aboutData = ${JSON.stringify(packages)};`
);