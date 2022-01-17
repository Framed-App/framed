function handleFramedLicense(data) {
	document.getElementById('version').innerText = data.version;
	document.getElementById('framedLicense').innerText = data.license;
}

var c = document.getElementsByClassName('3rd-party-software')[0];

function createLicenseDiv(name, version, license) {
	var div = document.createElement('div');
	div.className = '3rd-party-software-item';

	var h2 = document.createElement('h2');
	h2.innerText = `${name} ${version}`;
	div.appendChild(h2);

	var divL = document.createElement('div');
	divL.innerText = license;
	div.appendChild(divL);

	return div;
}

// eslint-disable-next-line no-undef
for (var d in aboutData) {
	if (d === 'framed') {
		// eslint-disable-next-line no-undef
		handleFramedLicense(aboutData[d]);
		continue;
	}
	// eslint-disable-next-line no-undef
	let l = aboutData[d];
	c.appendChild(createLicenseDiv(
		d,
		l.version,
		l.license
	));
}