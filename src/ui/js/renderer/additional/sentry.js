/* global Sentry */

/* I am aware that this way of initializing Sentry will not catch
 * any errors that happen as soon as the window opens, but I couldn't
 * find any other way to implement this in the required way.
 */

var _init = false;
window.framed.receiveInstallId((id) => {
	window.framed.receiveIsAnalyticsEnabled((enabled) => {
		if (_init) return;
		if (!enabled) return;

		Sentry.init({
			dsn: 'https://f50fab09b3594ba498ecc266b95d07b5@o1153309.ingest.sentry.io/6232316',
			environment: window.framed.isProd() ? 'production' : 'development',
			release: `${window.framed.getVersion()}${window.framed.isProd() ? '' : ' (dev)'}`
		});
		Sentry.setUser({ id });

		_init = true;
		console.log('Sentry initialized');
	});
	window.framed.getIsAnalyticsEnabled();
});
window.framed.getInstallId();