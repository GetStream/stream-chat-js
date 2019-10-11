const express = require('express');
const app = express();
app.use(express.json());
module.exports = {
	start() {
		app.post('*', function(req, res) {
			if (req.query.type === 'command') {
				const r = {
					text: 'hi, ' + req.body.args + '!',
					attachments: [
						{
							actions: [
								{
									name: 'action',
									value: 'left',
								},
								{
									name: 'action',
									value: 'right',
								},
							],
						},
					],
				};
				res.json(r);
				return;
			}
			if (req.query.type === 'action') {
				const name = req.body.action_values[0].name;
				const value = req.body.action_values[0].value;

				if (name === 'unknown' || value === 'unknown') {
					res.json({ error: { message: 'unknown action' } });
				}

				if (value === 'left') {
					const r = {
						text: 'you see a monster. Your actions?',
						attachments: [
							{
								actions: [
									{
										name: 'action',
										value: 'attack',
									},
									{
										name: 'action',
										value: 'trade',
									},
								],
							},
						],
					};
					res.json(r);
				}

				if (value === 'right') {
					res.json({
						text: 'You died.',
					});
				}
			}
		});

		app.listen(3333);
	},
	stop() {
		app.close();
	},
};
