const form = document.getElementById('burst-form');
const button = document.getElementById('run');
const statusWrap = document.getElementById('status-wrap');
const statusText = document.getElementById('status');
const recheckBtn = document.getElementById('recheck');

const setStatus = (text, kind, { showRecheck = false } = {}) => {
	statusText.textContent = text;
	statusWrap.className = `status status--${kind}`;
	recheckBtn.hidden = !showRecheck;
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

const detectFn = () => {
	const ch = window.streamChannel;
	if (!ch) return { found: false, reason: 'undefined' };
	if (typeof ch.getClient !== 'function')
		return { found: false, reason: 'not-a-channel' };
	try {
		const client = ch.getClient();
		if (!client || typeof client.handleEvent !== 'function') {
			return { found: false, reason: 'no-handle-event' };
		}
	} catch (e) {
		return { found: false, reason: 'getclient-threw' };
	}
	return { found: true, cid: ch.cid, type: ch.type, id: ch.id };
};

const REASON_TEXT = {
	undefined: 'window.streamChannel is not set on this page',
	'not-a-channel': 'window.streamChannel is set, but is not a Channel instance',
	'no-handle-event': 'channel.getClient().handleEvent is unavailable',
	'getclient-threw': 'channel.getClient() threw',
};

const detectChannel = async () => {
	button.disabled = true;
	setStatus('Detecting…', 'running');
	try {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (!tab?.id) throw new Error('No active tab.');

		const [injection] = await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			world: 'MAIN',
			func: detectFn,
		});

		const result = injection?.result;
		if (result?.found) {
			setStatus(`Ready · ${result.cid}`, 'ok', { showRecheck: true });
			button.disabled = false;
		} else {
			setStatus(
				REASON_TEXT[result?.reason] || 'window.streamChannel not detected',
				'error',
				{ showRecheck: true },
			);
			button.disabled = true;
		}
	} catch (err) {
		setStatus(`Detection failed: ${err?.message || String(err)}`, 'error', {
			showRecheck: true,
		});
		button.disabled = true;
	}
};

recheckBtn.addEventListener('click', () => {
	detectChannel();
});

form.addEventListener('submit', async (e) => {
	e.preventDefault();

	const config = readConfig();
	button.disabled = true;
	recheckBtn.hidden = true;
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
			setStatus(`Error: ${payload?.error || 'unknown failure'}`, 'error', {
				showRecheck: true,
			});
		} else {
			const r = payload.result;
			setStatus(
				`Dispatched ${r.dispatched} in ${r.durationMs}ms — ${r.messages} messages, ${r.reactions} reactions`,
				'ok',
				{ showRecheck: true },
			);
		}
	} catch (err) {
		setStatus(`Error: ${err?.message || String(err)}`, 'error', { showRecheck: true });
	} finally {
		button.disabled = false;
	}
});

detectChannel();
