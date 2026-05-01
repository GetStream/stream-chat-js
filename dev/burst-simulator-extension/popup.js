const form = document.getElementById('burst-form');
const button = document.getElementById('run');
const status = document.getElementById('status');

const setStatus = (text, kind) => {
	status.textContent = text;
	status.className = `status status--${kind}`;
};

const readConfig = () => {
	const data = new FormData(form);
	return {
		count: Number(data.get('count')),
		ratePerSec: Number(data.get('ratePerSec')),
		reactionRatio: Number(data.get('reactionRatio')),
		userPoolSize: Number(data.get('userPoolSize')),
		reactToLastN: Number(data.get('reactToLastN')),
	};
};

form.addEventListener('submit', async (e) => {
	e.preventDefault();

	const config = readConfig();
	button.disabled = true;
	setStatus('Running…', 'running');

	try {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (!tab?.id) throw new Error('No active tab.');

		await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			world: 'MAIN',
			files: ['simulator.js'],
		});

		const [injection] = await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			world: 'MAIN',
			func: async (cfg) => {
				try {
					return { ok: true, result: await window.__streamSimulateBurst(cfg) };
				} catch (err) {
					return { ok: false, error: err && err.message ? err.message : String(err) };
				}
			},
			args: [config],
		});

		const payload = injection?.result;
		if (!payload?.ok) {
			setStatus(`Error: ${payload?.error || 'unknown failure'}`, 'error');
		} else {
			const r = payload.result;
			setStatus(
				`Dispatched ${r.dispatched} in ${r.durationMs}ms — ${r.messages} messages, ${r.reactions} reactions`,
				'ok',
			);
		}
	} catch (err) {
		setStatus(`Error: ${err?.message || String(err)}`, 'error');
	} finally {
		button.disabled = false;
	}
});
