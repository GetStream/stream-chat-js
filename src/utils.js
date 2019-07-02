/**
 * logChatPromiseExecution - utility function for logging the execution of a promise..
 *  use this when you want to run the promise and handle errors by logging a warning
 *
 * @param {type} promise The promise you want to run and log
 * @param {type} name    A descriptive name of what the promise does for log output
 *
 */

export function logChatPromiseExecution(promise, name) {
	promise
		.then(() => {
			// do nothing...
		})
		.catch(error => {
			console.warn(`failed to do ${name}, ran into error: `, error);
		});
}

export const sleep = m => new Promise(r => setTimeout(r, m));

/**
 * Example:
 * const chatClient = new StreamChat(apiKey, {}, {
 * 	logger: {
 *  	tags: ['reconnection'],
 *  	excludeTags: ['wsevents'],
 *  	info: console.log,
 * 	}
 * });
 */
export const logService = {
	log(type, msg, tags = []) {
		if (!this.logger) return;

		const loggerTags = this.logger.tags || [];
		const loggerExcludeTags = this.logger.excludeTags || [];

		let shouldLog =
			loggerTags.length === 0 ||
			tags.reduce((acc, cur) => acc || loggerTags.indexOf(cur) > -1, false);
		shouldLog =
			shouldLog &&
			(loggerExcludeTags.length === 0 ||
				!tags.reduce(
					(acc, cur) => acc || loggerExcludeTags.indexOf(cur) > -1,
					false,
				));

		if (!shouldLog) return;

		switch (type) {
			case 'info':
				this.logger.info && this.logger.info(msg + ' at ' + new Date());
				break;
			case 'error':
				this.logger.error && this.logger.error(msg + ' at ' + new Date());
				break;
			default:
				break;
		}
	},
};
