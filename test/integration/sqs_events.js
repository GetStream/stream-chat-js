import { createUsers, getTestClient, sleep } from './utils';
import { v4 as uuidv4 } from 'uuid';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

const expect = chai.expect;

chai.use(chaiAsPromised);

describe('configure sqs event endpoints', function () {
	const serverAuth = getTestClient(true);

	it('should set valid sqs url', async () => {
		const valid_sqs_url = 'https://some-valid-url.com/';
		await serverAuth.updateAppSettings({
			sqs_url: valid_sqs_url,
		});

		const response = await serverAuth.getAppSettings();
		expect(response.app.sqs_url).to.eql(valid_sqs_url);
	});

	it('should fail on  invalid sqs url', async () => {
		const invalid = 'foobar';
		const p = serverAuth.updateAppSettings({
			sqs_url: invalid,
		});
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: UpdateApp failed with error: "sqs_url must be a valid URL"',
		);
	});

	it('should set valid sqs key', async () => {
		const sqs_key = 'abc';
		await serverAuth.updateAppSettings({
			sqs_key: sqs_key,
		});

		const response = await serverAuth.getAppSettings();
		expect(response.app.sqs_key).to.eql(sqs_key);
	});

	it('should set valid sqs secret', async () => {
		const sqs_secret = 'xyz';
		await serverAuth.updateAppSettings({
			sqs_secret: sqs_secret,
		});

		const response = await serverAuth.getAppSettings();
		expect(response.app.sqs_secret).to.eql(sqs_secret);
	});
});
