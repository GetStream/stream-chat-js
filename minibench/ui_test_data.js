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

setupData()
	.then()
	.catch(e => {
		console.log('e', e);
	});
