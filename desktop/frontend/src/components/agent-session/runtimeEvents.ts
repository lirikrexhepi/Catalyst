import { EventsOn } from '../../../wailsjs/runtime/runtime';
import type { RuntimeEvent } from './eventReducer';

/**
 * The backend emits runtime events in batches (every ~16ms, consecutive
 * deltas pre-merged) on this channel, so a streaming agent costs one state
 * update per frame instead of one per token.
 */
export const RUNTIME_EVENTS_CHANNEL = 'agent:events';

export function onRuntimeEvents(handler: (events: RuntimeEvent[]) => void): () => void {
  return EventsOn(RUNTIME_EVENTS_CHANNEL, (batch: RuntimeEvent[] | RuntimeEvent) => {
    const events = Array.isArray(batch) ? batch : [batch];
    if (events.length > 0) handler(events);
  });
}
