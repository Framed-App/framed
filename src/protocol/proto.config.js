var config = {
	// |+| is not likely to every be part of the data, so it is used as the delimiter
	delimiter: '|+|',
	// Framed|+|{{install id}}|+|{{msg json}}
	msgInParts: 4,
	minClientVersion: '0.0.1'
};

module.exports = config;