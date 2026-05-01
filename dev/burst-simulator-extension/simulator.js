(() => {
	const NAMES = [
		'Alex',
		'Sam',
		'Jordan',
		'Taylor',
		'Casey',
		'Morgan',
		'Riley',
		'Quinn',
		'Avery',
		'Hayden',
		'Reese',
		'Skyler',
		'Drew',
		'Parker',
		'Sage',
		'River',
		'Phoenix',
		'Rowan',
		'Cameron',
		'Logan',
	];

	const WORDS = [
		'the',
		'of',
		'and',
		'a',
		'to',
		'in',
		'is',
		'you',
		'that',
		'it',
		'he',
		'was',
		'for',
		'on',
		'are',
		'as',
		'with',
		'his',
		'they',
		'at',
		'be',
		'this',
		'have',
		'from',
		'or',
		'one',
		'had',
		'by',
		'word',
		'but',
		'not',
		'what',
		'all',
		'were',
		'we',
		'when',
		'your',
		'can',
		'said',
		'there',
		'use',
		'an',
		'each',
		'which',
		'she',
		'do',
		'how',
		'their',
		'if',
		'will',
		'up',
		'other',
		'about',
		'out',
		'many',
		'then',
		'them',
		'these',
		'so',
		'some',
		'her',
		'would',
		'make',
		'like',
		'him',
		'into',
		'time',
		'has',
		'look',
		'two',
		'more',
		'write',
		'go',
		'see',
		'number',
		'no',
		'way',
		'could',
		'people',
		'my',
		'than',
		'first',
		'water',
		'been',
		'call',
		'who',
		'its',
		'now',
		'find',
		'long',
		'down',
		'day',
		'did',
		'get',
		'come',
		'made',
		'may',
		'part',
		'over',
		'new',
		'sound',
		'take',
		'only',
		'little',
		'work',
		'know',
		'place',
		'year',
		'live',
		'me',
		'back',
		'give',
		'most',
		'very',
		'after',
		'thing',
		'our',
		'just',
		'name',
		'good',
		'man',
		'think',
		'say',
		'great',
		'where',
		'help',
		'through',
		'much',
		'before',
		'line',
		'right',
		'too',
		'means',
		'old',
		'any',
		'same',
		'tell',
		'boy',
		'follow',
		'came',
		'want',
		'show',
		'also',
		'around',
		'form',
		'three',
		'small',
		'set',
		'put',
		'end',
		'does',
		'another',
		'well',
		'large',
		'must',
		'big',
		'even',
		'such',
		'because',
		'turn',
		'here',
		'why',
		'ask',
		'went',
		'men',
		'read',
		'need',
		'land',
		'different',
		'home',
		'us',
		'move',
		'try',
		'kind',
		'hand',
		'picture',
		'again',
		'change',
		'off',
		'play',
		'spell',
		'air',
		'away',
		'animal',
		'house',
		'point',
		'page',
		'letter',
		'mother',
		'answer',
		'found',
		'study',
		'still',
		'learn',
		'should',
		'world',
		'high',
		'every',
		'near',
		'add',
		'food',
		'between',
		'own',
		'below',
		'country',
		'plant',
		'last',
		'school',
		'father',
		'keep',
		'tree',
		'never',
		'start',
		'city',
		'earth',
		'eye',
		'light',
		'thought',
		'head',
		'under',
		'story',
		'saw',
		'left',
		'few',
		'while',
		'along',
		'might',
		'close',
		'something',
		'seem',
		'next',
		'hard',
		'open',
		'example',
	];

	// Each entry pairs the rendered emoji with its base unicode codepoint
	// (lowercase hex, no variation selector) — Stream Chat reactions are
	// keyed as `emoji-<codepoint>` (e.g. 'emoji-1f4af' for 💯).
	const EMOJIS = [
		{ char: '😀', code: '1f600' },
		{ char: '🔥', code: '1f525' },
		{ char: '👀', code: '1f440' },
		{ char: '🎉', code: '1f389' },
		{ char: '💀', code: '1f480' },
		{ char: '✨', code: '2728' },
		{ char: '❤️', code: '2764' },
		{ char: '🤔', code: '1f914' },
		{ char: '👍', code: '1f44d' },
		{ char: '😅', code: '1f605' },
		{ char: '💯', code: '1f4af' },
	];

	const uuid = () => {
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
			return crypto.randomUUID();
		}
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
			const r = (Math.random() * 16) | 0;
			const v = c === 'x' ? r : (r & 0x3) | 0x8;
			return v.toString(16);
		});
	};

	const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

	const randomHex = (len) => {
		let s = '';
		for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 16).toString(16);
		return s;
	};

	const sampleWordCount = () => {
		const r = Math.random();
		if (r < 0.85) return 3 + Math.floor(Math.random() * 13);
		if (r < 0.97) return 16 + Math.floor(Math.random() * 15);
		return 31 + Math.floor(Math.random() * 20);
	};

	const escapeHtml = (s) =>
		s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');

	const generateText = () => {
		const n = sampleWordCount();
		const words = [];
		for (let i = 0; i < n; i++) words.push(pick(WORDS));

		if (Math.random() < 0.1) {
			const numEmojis = 1 + Math.floor(Math.random() * 3);
			for (let i = 0; i < numEmojis; i++) {
				const pos = Math.floor(Math.random() * (words.length + 1));
				words.splice(pos, 0, pick(EMOJIS).char);
			}
		}

		if (Math.random() < 0.05) {
			words.push(`https://example.com/${randomHex(12)}`);
		}

		let text = words.join(' ');

		if (Math.random() < 0.05) {
			const breaks = 1 + Math.floor(Math.random() * 2);
			const splitWords = text.split(' ');
			for (let i = 0; i < breaks; i++) {
				const pos = 1 + Math.floor(Math.random() * Math.max(1, splitWords.length - 1));
				splitWords[pos] = '\n' + splitWords[pos];
			}
			text = splitWords.join(' ');
		}

		return text;
	};

	const buildHtml = (text) => `<p>${escapeHtml(text).replace(/\n/g, '<br/>')}</p>\n`;

	const buildUserPool = (size) => {
		const now = new Date().toISOString();
		const users = [];
		for (let i = 0; i < size; i++) {
			const id = `sim_user_${i}`;
			const baseName = NAMES[i % NAMES.length];
			const name =
				i < NAMES.length ? baseName : `${baseName}_${Math.floor(i / NAMES.length)}`;
			users.push({
				id,
				name,
				image: `https://i.pravatar.cc/150?u=${encodeURIComponent(id)}`,
				language: '',
				role: 'user',
				teams: [],
				created_at: now,
				updated_at: now,
				last_active: now,
				banned: false,
				online: true,
				blocked_user_ids: [],
				shadow_banned: false,
				invisible: false,
				custom: {},
			});
		}
		return users;
	};

	const buildMessage = (channel, user) => {
		const now = new Date().toISOString();
		const text = generateText();
		return {
			id: uuid(),
			text,
			html: buildHtml(text),
			type: 'regular',
			user,
			member: { channel_role: 'channel_member', notifications_muted: false },
			attachments: [],
			latest_reactions: [],
			own_reactions: [],
			reaction_counts: {},
			reaction_scores: {},
			reaction_groups: {},
			reply_count: 0,
			deleted_reply_count: 0,
			cid: channel.cid,
			created_at: now,
			updated_at: now,
			shadowed: false,
			mentioned_users: [],
			mentioned_channel: false,
			mentioned_here: false,
			silent: false,
			pinned: false,
			pinned_at: null,
			pinned_by: null,
			pin_expires: null,
			restricted_visibility: [],
			notify_all_members: false,
		};
	};

	const buildMessageNewEvent = (channel, message) => ({
		type: 'message.new',
		created_at: new Date().toISOString(),
		cid: channel.cid,
		channel_type: channel.type,
		channel_id: channel.id,
		message_id: message.id,
		message,
		user: message.user,
		watcher_count: 1,
	});

	const buildReactionNewEvent = (channel, message, user) => {
		const now = new Date().toISOString();
		const emoji = pick(EMOJIS);
		const reactionType = `emoji-${emoji.code}`;

		const reaction = {
			type: reactionType,
			message_id: message.id,
			user_id: user.id,
			user,
			score: 1,
			created_at: now,
			updated_at: now,
		};

		// channel_state.addReaction (src/channel_state.ts) replaces the
		// in-state message with a copy of event.message after running
		// formatMessage on it. Whatever denormalized reaction state lives
		// on event.message is therefore what the UI ends up rendering —
		// the backend always pre-applies the reaction before delivering
		// the event, so we mirror that here.
		message.latest_reactions = [...(message.latest_reactions ?? []), reaction];
		const counts = message.reaction_counts ?? {};
		const scores = message.reaction_scores ?? {};
		const groups = message.reaction_groups ?? {};
		const existingGroup = groups[reactionType];
		message.reaction_counts = {
			...counts,
			[reactionType]: (counts[reactionType] ?? 0) + 1,
		};
		message.reaction_scores = {
			...scores,
			[reactionType]: (scores[reactionType] ?? 0) + 1,
		};
		message.reaction_groups = {
			...groups,
			[reactionType]: existingGroup
				? {
						count: existingGroup.count + 1,
						sum_scores: existingGroup.sum_scores + 1,
						first_reaction_at: existingGroup.first_reaction_at,
						last_reaction_at: now,
						latest_reactions_by: existingGroup.latest_reactions_by ?? [],
					}
				: {
						count: 1,
						sum_scores: 1,
						first_reaction_at: now,
						last_reaction_at: now,
						latest_reactions_by: [],
					},
		};

		return {
			type: 'reaction.new',
			created_at: now,
			cid: channel.cid,
			channel_type: channel.type,
			channel_id: channel.id,
			message_id: message.id,
			message,
			reaction,
			user,
		};
	};

	async function simulateBurst(config = {}) {
		const channel =
			config.channel || (typeof window !== 'undefined' ? window.streamChannel : null);
		if (!channel || typeof channel.getClient !== 'function') {
			throw new Error('window.streamChannel is not set or is not a Channel instance');
		}
		const client = channel.getClient();
		if (!client || typeof client.handleEvent !== 'function') {
			throw new Error('channel.getClient().handleEvent is unavailable');
		}

		const count = Math.max(0, Number(config.count ?? 200) | 0);
		const ratePerSecRaw = config.ratePerSec ?? 50;
		const ratePerSec = ratePerSecRaw === Infinity ? Infinity : Number(ratePerSecRaw);
		const reactionRatio = Math.max(0, Math.min(1, Number(config.reactionRatio ?? 0.3)));
		const userPoolSize = Math.max(1, Number(config.userPoolSize ?? 10) | 0);
		const reactToLastN = Math.max(1, Number(config.reactToLastN ?? 20) | 0);

		const users = buildUserPool(userPoolSize);
		const recentMessages = [];
		const counters = { dispatched: 0, messages: 0, reactions: 0 };
		const start = performance.now();

		// Mirror the real receive path: src/connection.ts onmessage parses
		// the frame locally (health-check / error shortcut), then
		// src/client.ts handleEvent parses it again before dispatching.
		// Both parses happen per frame in production — pay both here too.
		const dispatchOne = () => {
			const user = pick(users);
			const wantReaction = Math.random() < reactionRatio && recentMessages.length > 0;
			let event;
			if (wantReaction) {
				const target = pick(recentMessages);
				event = buildReactionNewEvent(channel, target, user);
				counters.reactions++;
			} else {
				const message = buildMessage(channel, user);
				event = buildMessageNewEvent(channel, message);
				recentMessages.push(message);
				if (recentMessages.length > reactToLastN) recentMessages.shift();
				counters.messages++;
			}
			const jsonString = JSON.stringify(event);
			JSON.parse(jsonString); // mirrors onmessage's local parse
			client.handleEvent({ data: jsonString }); // parses again, then dispatches
			counters.dispatched++;
		};

		const burstAll =
			ratePerSec === 0 || ratePerSec === Infinity || !Number.isFinite(ratePerSec);

		if (burstAll) {
			await new Promise((resolve) =>
				requestAnimationFrame(() => {
					for (let i = 0; i < count; i++) dispatchOne();
					resolve();
				}),
			);
		} else {
			const interval = 1000 / ratePerSec;
			await new Promise((resolve) => {
				let i = 0;
				const tick = () => {
					if (i >= count) {
						resolve();
						return;
					}
					dispatchOne();
					i++;
					setTimeout(tick, interval);
				};
				tick();
			});
		}

		const result = {
			dispatched: counters.dispatched,
			durationMs: Math.round(performance.now() - start),
			messages: counters.messages,
			reactions: counters.reactions,
		};
		console.log('[burst-simulator] result', result);
		return result;
	}

	window.__streamSimulateBurst = simulateBurst;
})();
