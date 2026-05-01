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
	};
};

// Runs in the page's main world. Walks the React fiber tree to find a
// Channel-shaped object, binds it to window.streamChannel, and returns
// metadata about how it was found. Honors a pre-existing window.streamChannel
// (for users who set it manually).
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

	// Honor a manually-set window.streamChannel.
	if (window.streamChannel) {
		if (!isChannelLike(window.streamChannel)) {
			return { ok: false, reason: 'preset-not-a-channel' };
		}
		const v = validateUsable(window.streamChannel);
		if (!v.ok) return { ok: false, reason: v.reason };
		return {
			ok: true,
			source: 'preset',
			cid: window.streamChannel.cid,
			type: window.streamChannel.type,
			id: window.streamChannel.id,
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
	'preset-not-a-channel': 'window.streamChannel is set, but is not a Channel instance',
	'no-handle-event': 'channel.getClient().handleEvent is unavailable',
	'getclient-threw': 'channel.getClient() threw',
	'no-react-root': 'No React root found on this page',
	'no-channel-in-tree': 'No Channel-shaped prop found in the React tree',
};

const formatSuccess = (r) => {
	if (r.source === 'preset') {
		return `Ready · ${r.cid} · already bound`;
	}
	const detail = `auto-bound · ${r.via} '${r.propName}' on <${r.componentName}>`;
	const tail = r.candidates > 1 ? ` · best of ${r.candidates}` : '';
	return `Ready · ${r.cid} · ${detail}${tail}`;
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
