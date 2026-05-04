const form = document.getElementById('burst-form');
const button = document.getElementById('run');
const buttonLabel = button.querySelector('.run__label');
const buttonGlyph = button.querySelector('.run__chevron');
const statusWrap = document.getElementById('status-wrap');
const statusText = document.getElementById('status');
const recheckBtn = document.getElementById('recheck');

const setStatus = (text, kind, { showRecheck = false } = {}) => {
	statusText.textContent = text;
	statusWrap.className = `status status--${kind}`;
	recheckBtn.hidden = !showRecheck;
};

let runState = 'idle'; // 'idle' | 'running'
let pollTimer = null;
let pollSamples = []; // [{ at, dispatched }]
let runningTabId = null;
let isOwnRun = false; // true if THIS popup session started the run

const formatResult = (r) => {
	const prefix = r.aborted ? 'Stopped at' : 'Dispatched';
	return `${prefix} ${r.dispatched} in ${r.durationMs}ms — ${r.messages} messages, ${r.reactions} reactions`;
};

const readPageStatus = async (tabId) => {
	try {
		const [injection] = await chrome.scripting.executeScript({
			target: { tabId },
			world: 'MAIN',
			func: () => {
				const sim = window.__streamSimulateBurst;
				if (!sim) return null;
				return {
					state: sim.state || null,
					lastResult: sim.lastResult || null,
				};
			},
		});
		return injection?.result || null;
	} catch (e) {
		return null;
	}
};

const setRunButton = (state) => {
	runState = state;
	if (state === 'running') {
		button.classList.add('run--stop');
		buttonGlyph.textContent = '■';
		buttonLabel.textContent = 'Stop';
	} else {
		button.classList.remove('run--stop');
		buttonGlyph.textContent = '▸';
		buttonLabel.textContent = 'Fire burst';
	}
};

const stopPolling = () => {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
	pollSamples = [];
};

const startPolling = (tabId) => {
	stopPolling();
	const localTimer = setInterval(async () => {
		try {
			const status = await readPageStatus(tabId);
			// Bail if polling was stopped while we were awaiting executeScript —
			// avoids clobbering the post-run summary with a stale "Running" line.
			if (pollTimer !== localTimer) return;

			const state = status?.state;
			if (!state) return;

			if (state.phase === 'done') {
				stopPolling();
				// For resumed runs there's no awaiting handler that will pick up
				// the result — we have to surface the summary ourselves. For
				// own runs the form-submit handler is awaiting and will do it,
				// so leave the status alone here.
				if (!isOwnRun) {
					const r = status.lastResult;
					if (r) {
						setStatus(formatResult(r), 'ok', { showRecheck: true });
					}
					setRunButton('idle');
					runningTabId = null;
				}
				return;
			}

			const now = performance.now();
			pollSamples.push({ at: now, dispatched: state.dispatched });
			while (pollSamples.length > 5) pollSamples.shift();

			let eps = 0;
			if (pollSamples.length >= 2) {
				const first = pollSamples[0];
				const last = pollSamples[pollSamples.length - 1];
				const dtMs = last.at - first.at;
				const dDispatched = last.dispatched - first.dispatched;
				eps = dtMs > 0 ? Math.round((dDispatched / dtMs) * 1000) : 0;
			}

			const elapsedSec = Math.max(0, Math.floor((Date.now() - state.startWallMs) / 1000));
			setStatus(
				`Running · ${state.dispatched} / ${state.target} · ${eps} eps · ${elapsedSec}s`,
				'running',
				{ showRecheck: false },
			);
		} catch (e) {
			// Tab navigated away or permission revoked — stop quietly.
			if (pollTimer === localTimer) stopPolling();
		}
	}, 300);
	pollTimer = localTimer;
};

const requestAbort = async () => {
	if (!runningTabId) return;
	try {
		await chrome.scripting.executeScript({
			target: { tabId: runningTabId },
			world: 'MAIN',
			func: () => {
				if (window.__streamSimulateBurst) window.__streamSimulateBurst.abort = true;
			},
		});
	} catch (e) {
		// best-effort
	}
};

const readConfig = () => {
	const data = new FormData(form);
	return {
		count: Number(data.get('count')),
		ratePerSec: Number(data.get('ratePerSec')),
		reactionRatio: Number(data.get('reactionRatio')),
		userPoolSize: Number(data.get('userPoolSize')),
	};
};

// Runs in the page's main world. Walks the React fiber tree to find a
// Channel-shaped object, binds it to window.streamChannel, and returns
// metadata about how it was found. Honors a pre-existing window.streamChannel
// or window.channel (for users who set one manually).
const findChannelFn = () => {
	const isChannelLike = (v) => {
		if (!v || typeof v !== 'object') return false;
		if (typeof v.getClient !== 'function') return false;
		if (typeof v.cid !== 'string' || !v.cid.includes(':')) return false;
		if (typeof v.id !== 'string' || typeof v.type !== 'string') return false;
		return true;
	};

	const validateUsable = (ch) => {
		try {
			const client = ch.getClient();
			if (!client || typeof client.handleEvent !== 'function') {
				return { ok: false, reason: 'no-handle-event' };
			}
			return { ok: true };
		} catch (e) {
			return { ok: false, reason: 'getclient-threw' };
		}
	};

	// Honor a manually-set channel global. window.streamChannel takes
	// precedence (legacy/canonical name); window.channel is a fallback
	// alias so apps that already expose the channel under that name
	// don't need extra plumbing.
	const presetName = window.streamChannel
		? 'streamChannel'
		: window.channel
			? 'channel'
			: null;
	if (presetName) {
		const preset = window[presetName];
		if (!isChannelLike(preset)) {
			return { ok: false, reason: 'preset-not-a-channel' };
		}
		const v = validateUsable(preset);
		if (!v.ok) return { ok: false, reason: v.reason };
		return {
			ok: true,
			source: 'preset',
			presetName,
			cid: preset.cid,
			type: preset.type,
			id: preset.id,
		};
	}

	// Locate React fiber roots — property name varies between React versions.
	const valueToRootFiber = (v) => {
		if (!v || typeof v !== 'object') return null;
		if (v.current && v.current.tag !== undefined) return v.current; // FiberRoot
		if (v._internalRoot && v._internalRoot.current) return v._internalRoot.current;
		if (v.tag !== undefined && 'memoizedProps' in v) return v; // already a HostRoot fiber
		return null;
	};

	const roots = [];
	const visited = new WeakSet();
	const scan = (el) => {
		if (!el || visited.has(el)) return;
		visited.add(el);
		for (const k of Object.keys(el)) {
			if (k.startsWith('__reactContainer$') || k === '_reactRootContainer') {
				const r = valueToRootFiber(el[k]);
				if (r) roots.push(r);
			}
		}
		const children = el.children;
		if (children) {
			for (let i = 0; i < children.length; i++) scan(children[i]);
		}
	};
	if (document.body) scan(document.body);

	if (roots.length === 0) {
		return { ok: false, reason: 'no-react-root' };
	}

	// Walk each tree, collect every fiber whose memoizedProps reference a
	// Channel-like object — directly or via a Provider's `value` wrapper.
	const candidates = [];
	for (const root of roots) {
		const stack = [root];
		while (stack.length) {
			const fiber = stack.pop();
			if (!fiber) continue;

			const props = fiber.memoizedProps;
			if (props && typeof props === 'object') {
				for (const k in props) {
					const v = props[k];
					if (isChannelLike(v)) {
						candidates.push({ channel: v, fiber, propName: k, via: 'prop' });
						continue;
					}
					// Stream Chat React puts the channel inside a Provider value
					// object (e.g. ChannelStateContext.Provider value={{ channel, ... }}).
					if (k === 'value' && v && typeof v === 'object') {
						for (const k2 in v) {
							if (isChannelLike(v[k2])) {
								candidates.push({
									channel: v[k2],
									fiber,
									propName: `value.${k2}`,
									via: 'context',
								});
							}
						}
					}
				}
			}

			if (fiber.sibling) stack.push(fiber.sibling);
			if (fiber.child) stack.push(fiber.child);
		}
	}

	if (candidates.length === 0) {
		return { ok: false, reason: 'no-channel-in-tree' };
	}

	// Tiebreak: when multiple distinct Channels exist (e.g. a ChannelList of
	// previews + the active <Channel>), pick the one whose owning fiber wraps
	// the largest subtree. The active channel typically wraps the entire
	// message list while previews are near-leaves.
	const countDescendants = (fiber) => {
		if (!fiber || !fiber.child) return 0;
		let count = 0;
		const s = [fiber.child];
		while (s.length) {
			const f = s.pop();
			if (!f) continue;
			count++;
			if (f.sibling) s.push(f.sibling);
			if (f.child) s.push(f.child);
		}
		return count;
	};

	// Dedupe by channel identity, keeping the highest descendant count seen.
	const byChannel = new Map();
	for (const c of candidates) {
		const d = countDescendants(c.fiber);
		const existing = byChannel.get(c.channel);
		if (!existing || d > existing.descendants) {
			byChannel.set(c.channel, { ...c, descendants: d });
		}
	}
	const ranked = Array.from(byChannel.values()).sort(
		(a, b) => b.descendants - a.descendants,
	);

	const best = ranked[0];
	const usable = validateUsable(best.channel);
	if (!usable.ok) return { ok: false, reason: usable.reason };

	window.streamChannel = best.channel;

	const fiberType = best.fiber && best.fiber.type;
	const componentName =
		(fiberType &&
			typeof fiberType === 'function' &&
			(fiberType.displayName || fiberType.name)) ||
		(typeof fiberType === 'string' ? fiberType : null) ||
		'Anonymous';

	return {
		ok: true,
		source: 'fiber',
		cid: best.channel.cid,
		type: best.channel.type,
		id: best.channel.id,
		propName: best.propName,
		via: best.via,
		componentName,
		descendants: best.descendants,
		candidates: ranked.length,
	};
};

const REASON_TEXT = {
	'preset-not-a-channel':
		'window.streamChannel / window.channel is set but is not a Channel instance',
	'no-handle-event': 'channel.getClient().handleEvent is unavailable',
	'getclient-threw': 'channel.getClient() threw',
	'no-react-root': 'No React root found on this page',
	'no-channel-in-tree': 'No Channel-shaped prop found in the React tree',
};

const formatSuccess = (r) => {
	if (r.source === 'preset') {
		return `Ready · ${r.cid} · bound to window.${r.presetName}`;
	}
	const detail = `auto-bound · ${r.via} '${r.propName}' on <${r.componentName}>`;
	const tail = r.candidates > 1 ? ` · best of ${r.candidates}` : '';
	return `Ready · ${r.cid} · ${detail}${tail}`;
};

const maybeResumeRun = async (tabId) => {
	const status = await readPageStatus(tabId);
	if (!status) return;

	if (status.state?.phase === 'running') {
		// A previous popup session (or the same one before close) kicked off
		// this burst; re-attach to it as a watcher.
		runningTabId = tabId;
		isOwnRun = false;
		setRunButton('running');
		recheckBtn.hidden = true;
		setStatus('Re-attached to run…', 'running');
		startPolling(tabId);
	} else if (status.lastResult) {
		// Last run finished while the popup was closed (or before this open).
		// Show its summary instead of the channel-detection text.
		setStatus(formatResult(status.lastResult), 'ok', { showRecheck: true });
	}
};

const detectChannel = async () => {
	button.disabled = true;
	setStatus('Scanning React tree…', 'running');
	try {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (!tab?.id) throw new Error('No active tab.');

		const [injection] = await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			world: 'MAIN',
			func: findChannelFn,
		});

		const result = injection?.result;
		if (result?.ok) {
			setStatus(formatSuccess(result), 'ok', { showRecheck: true });
			button.disabled = false;
			// If a burst is already running on this tab, or just finished,
			// surface that instead of leaving the channel-detection text up.
			await maybeResumeRun(tab.id);
		} else {
			setStatus(REASON_TEXT[result?.reason] || 'channel detection failed', 'error', {
				showRecheck: true,
			});
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

	if (runState === 'running') {
		// Second click while a run is in flight → request abort. The simulator
		// resolves on its next tick with `aborted: true`, and the in-flight
		// `await` below picks up the partial result and reports it.
		await requestAbort();
		return;
	}

	const config = readConfig();
	recheckBtn.hidden = true;
	setStatus('Running…', 'running');
	setRunButton('running');
	isOwnRun = true;

	const isPaced = config.ratePerSec > 0 && Number.isFinite(config.ratePerSec);

	try {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (!tab?.id) throw new Error('No active tab.');
		runningTabId = tab.id;

		await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			world: 'MAIN',
			files: ['simulator.js'],
		});

		// In burst-all mode the entire batch runs in one rAF tick, so polling
		// would never get a chance to read fresh state. Skip the live readout
		// and let the post-run summary handle it.
		if (isPaced) startPolling(tab.id);

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

		stopPolling();

		const payload = injection?.result;
		if (!payload?.ok) {
			setStatus(`Error: ${payload?.error || 'unknown failure'}`, 'error', {
				showRecheck: true,
			});
		} else {
			const r = payload.result;
			const prefix = r.aborted ? 'Stopped at' : 'Dispatched';
			setStatus(
				`${prefix} ${r.dispatched} in ${r.durationMs}ms — ${r.messages} messages, ${r.reactions} reactions`,
				'ok',
				{ showRecheck: true },
			);
		}
	} catch (err) {
		setStatus(`Error: ${err?.message || String(err)}`, 'error', { showRecheck: true });
	} finally {
		stopPolling();
		setRunButton('idle');
		runningTabId = null;
		isOwnRun = false;
	}
});

detectChannel();
