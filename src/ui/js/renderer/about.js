document.getElementById('version').innerText = window.framed.getVersion();

document.getElementById('licensesBtn').addEventListener('click', () => {
	window.framed.showLicenseModal();
});

var c = document.getElementsByClassName('3rd-party-software')[0];

// Link is optional but recommended
function createAboutDiv(name, version, link) {
	var div = document.createElement('div');
	div.className = '3rd-party-software-item';

	if (!link) {
		var span = document.createElement('span');
		span.innerText = `${name} ${version}`;
		div.appendChild(span);
	} else {
		var a = document.createElement('a');
		a.href = link;
		a.innerText = `${name} ${version}`;
		div.appendChild(a);
	}

	return div;
	/*<div class="3rd-party-software-item">
		<a href="https://github.com/sindresorhus/electron-util">electron-util v0.17.2</a>
	</div>*/
}

// eslint-disable-next-line no-undef
for (var d in aboutData) {
	if (d === 'framed') continue;
	// eslint-disable-next-line no-undef
	let l = aboutData[d];
	c.appendChild(createAboutDiv(
		d,
		l.version,
		l.link
	));
}
