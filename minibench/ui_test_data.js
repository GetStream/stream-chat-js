import { StreamChat, logChatPromiseExecution } from '../src';
import {
	getUserClient,
	getRandomUserID,
	shuffle,
	randomMessageText,
	getServerClient,
	chunkArray,
	createUserToken,
} from './utils';
import uuidv4 from 'uuid/v4';

const publicChats = [{ type: 'livestream', id: '123' }];

async function cleanMessaging() {
	const c = getServerClient();
	const sort = { last_message_at: -1 };

	let filters = { type: 'messaging', example: 1 };
	let channels = await c.queryChannels(filters, sort);
	let channel = channels[0];
	channel.truncate();
	const user = { id: 'jack', name: 'Jack Three' };
	const johnny = { id: 'johnny', name: 'Johnny' };
	const response = await channel.sendMessage({
		text: `so excited about the next season https://www.youtube.com/watch?v=8X5gXIQmY-E`,
		user: user,
	});
	const messageID = response.message.id;
	await channel.sendReaction(messageID, { type: 'haha', user: johnny });
	const response2 = await channel.sendMessage({
		text: 'Anything else you guys are looking forward to?',
		user: user,
	});
	const response3 = await channel.sendMessage({
		text: 'GOT!',
		parent_id: response2.message.id,
		user: johnny,
	});
}

async function cleanLivestream() {
	const c = getServerClient();
	const filters = { type: 'livestream', id: 'general' };
	const sort = { last_message_at: -1 };

	const channels = await c.queryChannels(filters, sort);
	const channel = channels[0];

	await channel.truncate();
	const user1 = { id: 'marilyn', name: 'Marilyn' };
	const user2 = { id: 'jason', name: 'Jason' };
	const user3 = { id: 'richard', name: 'Richard' };

	const response = await channel.sendMessage({
		text: 'Anyone else think Uno is better than Fortnite?',
		user: user1,
	});
	await channel.sendReaction(response.message.id, { type: 'haha', user: user2 });
	await channel.sendReaction(response.message.id, { type: 'like', user: user3 });
	await channel.sendMessage({
		parent_id: response.message.id,
		text: 'actually I prefer Apex',
		user: user3,
	});

	// show of the giphy stuff
	const message = {
		command: 'giphy',
		attachments: [
			{
				type: 'giphy',
				title: 'fornite',
				title_link:
					'https://giphy.com/gifs/fortnite-emotes-cinema-of-gaming-5YbNjSC7MJzgeWkoup',
				thumb_url: 'https://media2.giphy.com/media/5YbNjSC7MJzgeWkoup/giphy.gif',
			},
		],
		args: 'fortnite',
		command: 'giphy',
		command_info: { name: 'Giphy' },
		user: user3,
	};
	const response2 = await channel.sendMessage(message);
}

async function cleanTeams() {
	const c = getServerClient();
	const filters = { type: 'team', example: 1 };
	const sort = { last_message_at: -1 };

	const channels = await c.queryChannels(filters, sort);
	console.log(channels.length);
	const channel = channels[0];
	for (const c of channels) {
		console.log(c.cid);
		await c.delete();
	}

	// create the dev, general and aww channel.
	const guido = { id: 'guido', name: 'Guido' };
	const serena = { id: 'serena', name: 'Serena' };
	const devChannel = await c.channel('team', 'dev', {
		created_by: guido,
		example: 1,
		name: '#dev',
		image:
			'https://cdn.chrisshort.net/testing-certificate-chains-in-go/GOPHER_MIC_DROP.png',
	});
	const generalChannel = await c.channel('team', 'general', {
		created_by: guido,
		example: 1,
		name: '#general',
		image:
			'https://images.unsplash.com/photo-1511649475669-e288648b2339?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=200&q=80',
	});
	const awwChannel = await c.channel('team', 'aww', {
		created_by: guido,
		example: 1,
		name: '#aww',
		image:
			'https://images.unsplash.com/photo-1425082661705-1834bfd09dca?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=200&q=80',
	});
	for (const c of [devChannel, generalChannel, awwChannel]) {
		await c.create();
	}

	const hamsterMessage = {
		text: '',
		command: 'giphy',
		user: guido,
		attachments: [
			{
				type: 'giphy',
				title: 'hamster',
				title_link: 'https://giphy.com/gifs/infinity-nom-noms-HrB1MUATg24Ra',
				thumb_url: 'https://media1.giphy.com/media/HrB1MUATg24Ra/giphy.gif',
			},
		],
		args: 'hamster',
		command: 'giphy',
		command_info: { name: 'Giphy' },
	};
	await awwChannel.truncate();
	await awwChannel.sendMessage(hamsterMessage);

	await generalChannel.truncate();
	await generalChannel.sendMessage({
		text:
			'Slash commands, replies, reactions, direct and group chats, everything you need to build your own slack style team chat app.',
		user: serena,
	});

	await devChannel.truncate();
	await devChannel.sendMessage({
		text: 'Check out the 1.12 release notes https://golang.org/doc/go1.12',
		user: { id: 'tommaso', name: 'Tommaso' },
	});
}

async function cleanCommerce() {
	const c = getServerClient();
	const channel = c.channel('commerce', 'realestate');
	await channel.truncate();
	const marvin = {
		id: 'marvin',
		name: 'Marvin the depressed robot',
		image: 'https://upload.wikimedia.org/wikipedia/en/c/cb/Marvin_%28HHGG%29.jpg',
	};
	await channel.sendMessage({
		text:
			'Stream supports custom chat bots, slash command automation and custom message types.',
		user: marvin,
	});
	/*
	const jane = {id: "jane", name: "Jane"};
	const john = {id: "john", name: "John"}
	await channel.sendMessage({
		text: "I'd like to buy a huge house in Aspen, what do you have available.?",
		user: jane
	});
	await channel.sendMessage({ text: '5 or 7 bedrooms?', user: john });
	await channel.sendMessage({ text: '7', user: jane });
	// TODO attachment types for houses in hawaii..
	await channel.sendMessage({
		text: 'No problem, I found these options',
		user: john,
		attachments: [
			{ image: 'image', thumb_url: 'https://d2787ndpv5cwhz.cloudfront.net/bb43e766fdc55058abb7d1fd6cd107d3d560123b/640x480.jpg', asset_url: 'https://d2787ndpv5cwhz.cloudfront.net/bb43e766fdc55058abb7d1fd6cd107d3d560123b/640x480.jpg', title: "220 Buttermilk Lane", title_link: "https://www.compass.com/listing/220-buttermilk-lane-aspen-co-81611/205873945944084353/" },
			{ image: 'image', thumb_url: 'https://d2787ndpv5cwhz.cloudfront.net/fd7268189937992b2fd6068118fb0a831bcb6c97/640x480.jpg', asset_url: 'https://d2787ndpv5cwhz.cloudfront.net/fd7268189937992b2fd6068118fb0a831bcb6c97/640x480.jpg', title: "34 Placer Lane", title_link: "https://www.compass.com/listing/34-placer-lane-aspen-co-81611/60840391921993345/" }
		],
	});*/
}

async function getAllPublicChannels() {
	const c = getServerClient();
	const sort = { last_message_at: -1 };

	let filters = { type: 'messaging', example: 1 };
	let channels = await c.queryChannels(filters, sort);

	filters = { type: 'team', example: 1 };
	channels = channels.concat(await c.queryChannels(filters, sort));

	filters = { type: 'commerce', id: 'realestate' };
	channels = channels.concat(await c.queryChannels(filters, sort));

	filters = { type: 'livestream', id: 'general' };
	channels = channels.concat(await c.queryChannels(filters, sort));

	return channels;
}

async function setupData() {
	const channels = await getAllPublicChannels();
	console.log('setting up van allen');
	const c = getServerClient();
	const joker = { id: 'joker', name: 'Joker' };
	const batman = { id: 'batman', name: 'Batman' };
	await c.updateUsers([batman, joker]);

	const jokerC = await getUserClient('joker');
	const batmanC = await getUserClient('batman');

	await c.channel('livestream', 'godevs').truncate();
	const jokerChannel = jokerC.channel('livestream', 'godevs', {
		image:
			'https://cdn.chrisshort.net/testing-certificate-chains-in-go/GOPHER_MIC_DROP.png',
		name: 'Talk about Go',
	});

	const batChannel = batmanC.channel('livestream', 'godevs');

	let response = await jokerChannel.sendMessage({
		text:
			"A Van Allen radiation belt is a zone of energetic charged particles, most of which originate from the solar wind, that are captured by and held around a planet by that planet's magentic field.",
	});
	await jokerChannel.sendReaction(response.message.id, { type: 'like' });
	await jokerChannel.sendReaction(response.message.id, { type: 'haha' });
	await batChannel.sendReaction(response.message.id, { type: 'haha' });

	response = await jokerChannel.sendMessage({
		text: 'Earth has two such belts and sometimes others may be temporarily created',
	});
	response = await batChannel.sendMessage({
		text:
			"Did you read about Jupiter? It's surrounded by an enormous magnetic field called the magnetosphere, which has a million times the volume of Earth's magnetosphere. Charged particles are trapped in the magnetosphere and form intense radiation belts. These belts are similar to the Earth's Van Allen belts, but are many millions of times more intense.",
	});

	const image1 =
		'http://www.nasa.gov/sites/default/files/thumbnails/image/van_allen_probes_discov_new_rad_belt_cal.jpg';
	const image2 =
		'https://www.geek.com/wp-content/uploads/2014/02/van-allen-belts-2-625x350.jpg';
	response = await jokerChannel.sendMessage({
		text:
			'There is a large outer belt that follows the magnetic field lines essentially from the north to south poles around the planet.',
		attachments: [{ type: 'image', thumb_url: image1, asset_url: image1 }],
	});
	response = await jokerChannel.sendMessage({
		attachments: [{ type: 'image', thumb_url: image2, asset_url: image2 }],
	});

	response = await batChannel.sendMessage({
		text:
			'The composition of the radiation belts differs between the belts and also is affected by solar radiation. Both belts are filled with plasma or charged particles. \n\n The innert belt has a relatively stable composition.',
	});

	response = await jokerChannel.sendMessage({
		text: 'https://www.youtube.com/watch?v=bLtgS2_qxJk',
	});
	response = await batChannel.sendMessage({
		text: 'https://www.nasa.gov/mission_pages/sunearth/news/gallery/rbsp-launch.html',
	});
	response = await batChannel.sendMessage({
		text: 'Check out this PDF from Nasa',
		attachments: [
			{
				type: 'file',
				title: 'Allen.pdf',
				asset_url:
					'https://stream-cloud-uploads.imgix.net/attachments/47574/5b07bf9c-b1c8-4260-867f-ecc5746f94ff.Allen.pdf?dl=Allen.pdf&s=ea119240f698f221db4102776b86fde0',
				mime_type: 'application/pdf',
				file_size: 138775,
			},
		],
	});

	response = await jokerChannel.sendMessage({
		text: 'Check out this PDF from Nasa',
		attachments: [
			{
				type: 'file',
				title: 'Allen.pdf',
				asset_url:
					'https://stream-cloud-uploads.imgix.net/attachments/47574/5b07bf9c-b1c8-4260-867f-ecc5746f94ff.Allen.pdf?dl=Allen.pdf&s=ea119240f698f221db4102776b86fde0',
				mime_type: 'application/pdf',
				file_size: 138775,
			},
		],
	});

	const message = {
		text: 'showing a giphy style command without being a giphy command',
		command: 'giphy',
		attachments: [
			{
				type: 'giphy',
				title: 'allen belts',
				title_link:
					'https://giphy.com/gifs/nasa-nasagif-van-allen-belts-probes-2wYVlrRY9i4kZzTPmY',
				thumb_url: 'https://media2.giphy.com/media/2wYVlrRY9i4kZzTPmY/giphy.gif',
				actions: [
					{
						name: 'image_action',
						text: 'Send',
						style: 'primary',
						type: 'button',
						value: 'send',
					},
					{
						name: 'image_action',
						text: 'Shuffle',
						style: 'default',
						type: 'button',
						value: 'shuffle',
					},
					{
						name: 'image_action',
						text: 'Cancel',
						style: 'default',
						type: 'button',
						value: 'cancel',
					},
				],
			},
		],
		args: 'allen belts',
		command: 'giphy',
		command_info: { name: 'Giphy' },
	};
	//response = await batChannel.sendMessage(message);
}

cleanTeams()
	.then()
	.catch(e => {
		console.log('e', e);
	});
