Location sharing allows users to send a static position or share their real-time location with other participants in a channel. Stream Chat supports both static and live location sharing.

There are two types of location sharing:

- **Static Location**: A one-time location share that does not update over time.
- **Live Location**: A real-time location sharing that updates over time.

> [!NOTE]
> The SDK handles location message creation and updates, but location tracking must be implemented by the application using device location services.


## Enabling location sharing

The location sharing feature must be activated at the channel level before it can be used. You have two configuration options: activate it for a single channel using configuration overrides, or enable it globally for all channels of a particular type via [channel type settings](/chat/docs/node/channel_features/).

```javascript
// Enabling it for a channel
await channel.updatePartial({
  set: {
    config_overrides: {
      shared_locations: true,
    },
  },
});

// Enabling it for a channel type
const update = await client.updateChannelType("messaging", {
  shared_locations: true,
});
```

## Sending static location

Static location sharing allows you to send a message containing a static location.

```javascript
const channel = client.channel("type", "id");

// Send a message with a static location.
channel.sendSharedLocation({
  created_by_device_id: "device-id",
  latitude: 10,
  longitude: 10,
  message_id: "message-id",
});
```

## Starting live location sharing

Live location sharing enables real-time location updates for a specified duration. The SDK manages the location message lifecycle, but your application is responsible for providing location updates.

```javascript
const channel = client.channel("type", "id");

// Send a message with a live location.
// Live location differs from the static location by the termination timestamp end_at.
channel.sendSharedLocation({
  created_by_device_id: "device-id",
  end_at: "2225-07-22T09:30:12.507Z",
  latitude: 10,
  longitude: 10,
  message_id: "message-id",
});
```

## Stopping live location sharing

You can stop live location sharing for a specific message using the message controller:

```javascript
const channel = client.channel("type", "id");

// to stop location sharing at least message id has to be provided
channel.stopLiveLocationSharing({
  message_id: "message-id",
});
```

## Updating live location

Your application must implement location tracking and provide updates to the SDK. The SDK handles updating all the current user's active live location messages and provides a throttling mechanism to prevent excessive API calls.

```javascript
// simple call to update a location
await client.updateLocation({
  latitude: 1,
  longitude: 2,
  message_id: "message-id",
});
```

Whenever the location is updated, the message will automatically be updated with the new location.

The SDK will also notify your application when it should start or stop location tracking as well as when the active live location messages change.

```javascript
// reporter function necessary for LiveLocationManager
const watchLocation = (handler) => {
  const timer = setInterval(() => {
    // retrieval of current location is a app-specific logic
    getCurrentPosition((position) => {
      handler({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    });
  }, 5000);

  return () => {
    clearInterval(timer);
  };
};

// the manager takes care of registering/ unregistering and reporting location updates
const manager = new LiveLocationManager({
  client,
  getDeviceId, // function should generate a unique device id
  watchLocation, // function should retrieve the location and pass it to the handler function
});

// to start watching and reporting the manager subscriptions have to be initiated
manager.init();

// to stop watching and reporting the manager subscriptions have cleaned up
manager.unregisterSubscriptions();
```

## Events

Whenever a location is created or updated, the following WebSocket events will be sent:

- `message.new`: When a new location message is created.
- `message.updated`: When a location message is updated.

> [!NOTE]
> In Dart, these events are resolved to more specific location events:
>
> - `location.shared`: When a new location message is created.
> - `location.updated`: When a location message is updated.


You can easily check if a message is a location message by checking the `message.sharedLocation` property. For example, you can use this events to render the locations in a map view.
