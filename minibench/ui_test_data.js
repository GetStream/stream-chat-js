import { StreamChat, logChatPromiseExecution } from '../src';
import {
	getUserClient,
	getRandomUserID,
	shuffle,
	randomMessageText,
	getServerClient,
	chunkArray,
  createUserToken
} from './utils';
import uuidv4 from 'uuid/v4';



async function setupData() {
  const c = getServerClient();
  const joker = {id: 'joker', name: 'Joker'}
  const batman = {id: 'batman', name: 'Batman'}
  await c.updateUsers([batman, joker])

  const jokerC = await getUserClient('joker')
  const batmanC = await getUserClient('batman')


  try {
    await c.channel('messaging', 'aww').delete()
  } catch(e) {
    //
  }
  const channel = c.channel('messaging', 'aww')

  const awwChannel = c.channel('messaging', 'aww', {
    created_by: {id: 'batman'},
    example: 1,
    name: 'Aww',
    image: 'https://images.unsplash.com/photo-1525333570699-8e68ea7bf698?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=800&q=60'
  })

  await awwChannel.create()
  console.log("batman", batman)


  const r = await jokerC.channel('messaging', 'aww').sendMessage({text: "abc"})
  console.log('r', r)

  const filters = { type: 'messaging', example: 1 };
  const sort = { last_message_at: -1 };
  const channels = await jokerC.queryChannels(filters, sort, {
      subscribe: true,
  });
  for (const channel of channels) {
    console.log(channel.cid)
  }

}



setupData()
	.then()
	.catch(e => {
		console.log('e', e);
	});
