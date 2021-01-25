import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import fs from 'fs';
import { expectHTTPErrorCode, getServerTestClient, getTestClientForUser } from './utils';
import { v4 as uuidv4 } from 'uuid';

const expect = chai.expect;

chai.use(chaiAsPromised);

if (process.env.NODE_ENV !== 'production') {
	require('longjohn');
}

const Promise = require('bluebird');
Promise.config({
	longStackTraces: true,
	warnings: {
		wForgottenReturn: false,
	},
});

describe('Uploads', () => {
	const serverClient = getServerTestClient();
	const channelType = uuidv4();
	let client;
	let channel;

	before(async () => {
		client = await getTestClientForUser(uuidv4());
		await serverClient.createChannelType({
			name: channelType,
			commands: ['all'],
			uploads: true,
		});
		channel = client.channel(channelType, uuidv4());
		await channel.watch();
	});
	afterEach(async () => {
		await serverClient.updateAppSettings({
			file_upload_config: {
				allowed_file_extensions: [],
				blocked_file_extensions: [],
				allowed_mime_types: [],
				blocked_mime_types: [],
			},
			image_upload_config: {
				allowed_file_extensions: [],
				blocked_file_extensions: [],
				allowed_mime_types: [],
				blocked_mime_types: [],
			},
		});
	});
	describe('File Extension Restrictions', () => {
		it('set file extension allowlist and blocklist', async () => {
			await expectHTTPErrorCode(
				400,
				serverClient.updateAppSettings({
					file_upload_config: {
						allowed_file_extensions: ['.txt', '.csv'],
						blocked_file_extensions: ['.json'],
					},
				}),
				`StreamChat error code 4: UpdateApp failed with error: "Cannot specify both allowed file extensions and blocked file extensions"`,
			);
		});
		it('set image file extension allowlist and blocklist', async () => {
			await expectHTTPErrorCode(
				400,
				serverClient.updateAppSettings({
					image_upload_config: {
						allowed_file_extensions: ['.jpg', '.png'],
						blocked_file_extensions: ['.heic'],
					},
				}),
				`StreamChat error code 4: UpdateApp failed with error: "Cannot specify both allowed file extensions and blocked file extensions"`,
			);
		});
		it('upload a file with extension on allowlist', async () => {
			await serverClient.updateAppSettings({
				file_upload_config: {
					allowed_file_extensions: ['.txt', '.csv'],
				},
			});
			const file = fs.createReadStream('helloworld.txt');
			const response = await channel.sendFile(file, 'helloworld.txt', 'text/plain');
			expect(response.file).to.be.an('string');
			expect(response.file).to.be.not.undefined;
			expect(response.file).to.be.not.eq('');
		});
		it('upload an image with extension on allowlist', async () => {
			await serverClient.updateAppSettings({
				image_upload_config: {
					allowed_file_extensions: ['.jpg', '.png'],
				},
			});
			const file = fs.createReadStream('helloworld.jpg');
			const response = await channel.sendImage(
				file,
				'helloworld.jpg',
				'image/jpeg',
			);
			expect(response.file).to.be.an('string');
			expect(response.file).to.be.not.undefined;
			expect(response.file).to.be.not.eq('');
		});
		it('upload a file with extension not on blocklist', async () => {
			await serverClient.updateAppSettings({
				file_upload_config: {
					blocked_file_extensions: ['.pdf'],
				},
			});
			const file = fs.createReadStream('helloworld.txt');
			const response = await channel.sendFile(file, 'helloworld.txt', 'text/plain');
			expect(response.file).to.be.an('string');
			expect(response.file).to.be.not.undefined;
			expect(response.file).to.be.not.eq('');
		});
		it('upload an image with extension not on blocklist', async () => {
			await serverClient.updateAppSettings({
				image_upload_config: {
					blocked_file_extensions: ['.heic'],
				},
			});
			const file = fs.createReadStream('helloworld.jpg');
			const response = await channel.sendImage(
				file,
				'helloworld.jpg',
				'image/jpeg',
			);
			expect(response.file).to.be.an('string');
			expect(response.file).to.be.not.undefined;
			expect(response.file).to.be.not.eq('');
		});
		it('upload a file with extension not on allowlist', async () => {
			await serverClient.updateAppSettings({
				file_upload_config: {
					allowed_file_extensions: ['.txt', '.csv'],
				},
			});
			const file = Buffer.from('random string');
			await expectHTTPErrorCode(
				400,
				channel.sendFile(file, 'helloworld.md', 'text/markdown'),
				`StreamChat error code 4: UploadFile failed with error: "File extension .md is not supported"`,
			);
		});
		it('upload an image with extension not on allowlist', async () => {
			await serverClient.updateAppSettings({
				image_upload_config: {
					allowed_file_extensions: ['.jpeg'],
				},
			});
			const file = fs.createReadStream('helloworld.heic');
			await expectHTTPErrorCode(
				400,
				channel.sendImage(file, 'helloworld.heic', 'image/heic'),
				`StreamChat error code 4: UploadImage failed with error: "File extension .heic is not supported"`,
			);
		});
		it('upload a file with extension on blocklist', async () => {
			await serverClient.updateAppSettings({
				file_upload_config: {
					blocked_file_extensions: ['.md'],
				},
			});
			const file = Buffer.from('random string');
			await expectHTTPErrorCode(
				400,
				channel.sendFile(file, 'helloworld.md', 'text/markdown'),
				`StreamChat error code 4: UploadFile failed with error: "File extension .md is not supported"`,
			);
		});
		it('upload an image with extension on blocklist', async () => {
			await serverClient.updateAppSettings({
				image_upload_config: {
					blocked_file_extensions: ['.heic'],
				},
			});
			const file = fs.createReadStream('helloworld.heic');
			await expectHTTPErrorCode(
				400,
				channel.sendImage(file, 'helloworld.heic', 'image/heic'),
				`StreamChat error code 4: UploadImage failed with error: "File extension .heic is not supported"`,
			);
		});
	});
	describe('Content Type Restrictions', () => {
		it('set content type allowlist and blocklist', async () => {
			await expectHTTPErrorCode(
				400,
				serverClient.updateAppSettings({
					file_upload_config: {
						allowed_mime_types: ['text/plain', 'text/csv'],
						blocked_mime_types: ['application/json'],
					},
				}),
				`StreamChat error code 4: UpdateApp failed with error: "Cannot specify both allowed mime types and blocked mime types"`,
			);
		});
		it('set image mime type allowlist and blocklist', async () => {
			await expectHTTPErrorCode(
				400,
				serverClient.updateAppSettings({
					image_upload_config: {
						allowed_mime_types: ['text/plain', 'text/csv'],
						blocked_mime_types: ['application/json'],
					},
				}),
				`StreamChat error code 4: UpdateApp failed with error: "Cannot specify both allowed mime types and blocked mime types"`,
			);
		});
		it('upload a file with mime type on allowlist', async () => {
			await serverClient.updateAppSettings({
				file_upload_config: {
					allowed_mime_types: ['text/plain', 'text/csv'],
				},
			});
			const file = fs.createReadStream('helloworld.txt');
			const response = await channel.sendFile(file, 'helloworld.txt', 'text/plain');
			expect(response.file).to.be.an('string');
			expect(response.file).to.be.not.undefined;
			expect(response.file).to.be.not.eq('');
		});
		it('upload an image with mime type on allowlist', async () => {
			await serverClient.updateAppSettings({
				image_upload_config: {
					allowed_mime_types: ['image/jpeg'],
				},
			});
			const file = fs.createReadStream('helloworld.jpg');
			const response = await channel.sendImage(
				file,
				'helloworld.jpg',
				'image/jpeg',
			);
			expect(response.file).to.be.an('string');
			expect(response.file).to.be.not.undefined;
			expect(response.file).to.be.not.eq('');
		});
		it('upload a file with mime type not on blocklist', async () => {
			await serverClient.updateAppSettings({
				file_upload_config: {
					blocked_mime_types: ['application/json'],
				},
			});
			const file = fs.createReadStream('helloworld.txt');
			const response = await channel.sendFile(file, 'helloworld.txt', 'text/plain');
			expect(response.file).to.be.an('string');
			expect(response.file).to.be.not.undefined;
			expect(response.file).to.be.not.eq('');
		});
		it('upload an image with mime type not on blocklist', async () => {
			await serverClient.updateAppSettings({
				image_upload_config: {
					blocked_mime_types: ['image/heic'],
				},
			});
			const file = fs.createReadStream('helloworld.jpg');
			const response = await channel.sendImage(
				file,
				'helloworld.jpg',
				'image/jpeg',
			);
			expect(response.file).to.be.an('string');
			expect(response.file).to.be.not.undefined;
			expect(response.file).to.be.not.eq('');
		});
		it('upload a file with mime type not on allowlist', async () => {
			await serverClient.updateAppSettings({
				file_upload_config: {
					allowed_mime_types: ['text/plain', 'text/csv'],
				},
			});
			const file = Buffer.from('random string');
			await expectHTTPErrorCode(
				400,
				channel.sendFile(file, 'helloworld.md', 'text/markdown'),
				`StreamChat error code 4: UploadFile failed with error: "File type text/markdown is not supported"`,
			);
		});
		it('upload an image with mime type not on allowlist', async () => {
			await serverClient.updateAppSettings({
				image_upload_config: {
					allowed_mime_types: ['image/jpeg'],
				},
			});
			const file = fs.createReadStream('helloworld.heic');
			await expectHTTPErrorCode(
				400,
				channel.sendImage(file, 'helloworld.heic', 'image/heic'),
				`StreamChat error code 4: UploadImage failed with error: "File type image/heic is not supported"`,
			);
		});
		it('upload a file with mime type on blocklist', async () => {
			await serverClient.updateAppSettings({
				file_upload_config: {
					blocked_mime_types: ['text/markdown'],
				},
			});
			const file = Buffer.from('random string');
			await expectHTTPErrorCode(
				400,
				channel.sendFile(file, 'helloworld.md', 'text/markdown'),
				`StreamChat error code 4: UploadFile failed with error: "File type text/markdown is not supported"`,
			);
		});
		it('upload an image with mime type on blocklist', async () => {
			await serverClient.updateAppSettings({
				image_upload_config: {
					blocked_mime_types: ['image/heic'],
				},
			});
			const file = fs.createReadStream('helloworld.heic');
			await expectHTTPErrorCode(
				400,
				channel.sendImage(file, 'helloworld.heic', 'image/heic'),
				`StreamChat error code 4: UploadImage failed with error: "File type image/heic is not supported"`,
			);
		});
	});
});
