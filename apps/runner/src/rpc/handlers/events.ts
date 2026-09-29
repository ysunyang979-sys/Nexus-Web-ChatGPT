import type { LocalBridgeEventBus } from "../../events/event-bus-service.js";

export function createEventHandlers(eventBus: LocalBridgeEventBus) {
  return {
    publish: (params: any) => eventBus.publish(params),
    subscribe: (params: any) => eventBus.subscribe(params),
    unsubscribe: (params: any) => eventBus.unsubscribe(params),
    poll: (params: any) => eventBus.poll(params),
    history: (params: any) => eventBus.history(params),
    replay: (params: any) => eventBus.replay(params),
  };
}
