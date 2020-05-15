# Logging

You can use our logger functionality for the purpose of debugging.

```js
const client = new StreamChat('api_key', {}, {
		logger = (logLevel, message, extraData) => {
			console.log(message);
		}
})
```
extraData contains tags array attached to log message. Tags can have one/many of following values:

1. api
2. api_request
3. api_response
4. client
5. channel
6. connection
7. event

It may also contains some extra data, some examples have been mentioned below:

1. 
    ```json
    {
		tags: ['api', 'api_request', 'client'],
		url: string,
		payload: object,
		config: object
    }
    ```

2. 
    ```json
    {
		tags: ['api', 'api_response', 'client'],
		url: string,
		response: object
    }
    ```

3. 
    ```json
    {
		tags: ['api', 'api_response', 'client'],
		url: string,
		error: object
    }
    ```

4. 
    ```json
    {
		tags: ['event', 'client'],
		event: object
    }
    ```

5. 
    ```json
    {
		tags: ['channel'],
		channel: object
    }
    ```