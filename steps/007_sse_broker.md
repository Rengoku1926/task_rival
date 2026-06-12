# Step 007 — SSE Broker

An in-memory pub/sub broker. Each user can have multiple subscribers (multiple browser tabs). The broker is a singleton passed by pointer through the application.

## File: `internal/sse/broker.go`

```go
package sse

import (
	"encoding/json"
	"sync"

	"github.com/google/uuid"
)

// Event is the payload pushed to connected clients.
type Event struct {
	Type    string `json:"type"`    // task_created | task_updated | task_deleted
	Payload any    `json:"payload"` // the affected model
}

// Broker routes events to per-user subscriber channels.
type Broker struct {
	mu          sync.RWMutex
	subscribers map[uuid.UUID][]chan Event
}

func NewBroker() *Broker {
	return &Broker{
		subscribers: make(map[uuid.UUID][]chan Event),
	}
}

// Subscribe registers a new channel for userID.
// The returned unsubscribe function must be deferred by the caller.
func (b *Broker) Subscribe(userID uuid.UUID) (<-chan Event, func()) {
	ch := make(chan Event, 8) // buffered so a slow client doesn't block mutations

	b.mu.Lock()
	b.subscribers[userID] = append(b.subscribers[userID], ch)
	b.mu.Unlock()

	unsub := func() {
		b.mu.Lock()
		defer b.mu.Unlock()

		channels := b.subscribers[userID]
		for i, c := range channels {
			if c == ch {
				b.subscribers[userID] = append(channels[:i], channels[i+1:]...)
				break
			}
		}
		if len(b.subscribers[userID]) == 0 {
			delete(b.subscribers, userID)
		}
		close(ch)
	}

	return ch, unsub
}

// Publish sends an event to all subscribers of userID.
// It is non-blocking: if a subscriber's buffer is full the event is dropped for that subscriber.
func (b *Broker) Publish(userID uuid.UUID, event Event) {
	b.mu.RLock()
	channels := b.subscribers[userID]
	b.mu.RUnlock()

	for _, ch := range channels {
		select {
		case ch <- event:
		default:
			// subscriber too slow — drop this event for them
		}
	}
}

// PublishAll sends an event to every connected subscriber (used for admin broadcasts).
func (b *Broker) PublishAll(event Event) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	for _, channels := range b.subscribers {
		for _, ch := range channels {
			select {
			case ch <- event:
			default:
			}
		}
	}
}

// Marshal serialises an Event to the SSE wire format:
//
//	data: {"type":"task_updated","payload":{...}}\n\n
func Marshal(e Event) ([]byte, error) {
	b, err := json.Marshal(e)
	if err != nil {
		return nil, err
	}
	return append([]byte("data: "), append(b, '\n', '\n')...), nil
}
```

## How the SSE handler uses this

```
1. Client connects: GET /events?token=<access_token>
2. SSE handler verifies the token (same JWT as API)
3. handler calls broker.Subscribe(userID) → gets a channel + cleanup func
4. handler streams events from the channel as "data: {...}\n\n"
5. On client disconnect (context cancelled) → deferred unsubscribe runs
6. On any task mutation → service calls broker.Publish(userID, event)
```

## Notes

- Buffered channel (size 8) prevents a slow client from blocking the service layer that calls `Publish`.
- The `default:` case in `Publish` drops events rather than blocking — an `invalidateQueries` call on the frontend covers any gaps.
- `PublishAll` is used when an admin modifies a task owned by another user.
- This broker is in-memory only. If you ever scale to multiple server instances you would need a pub/sub backend (Redis). For a single Render instance this is sufficient.
