package worker

import "sync"

// planTracker remembers which cached AI plan an in-flight job is building
// with, so that if the job fails the entry responsible can be removed.
//
// Without this, a plan whose build script is wrong would be re-read from cache
// on every retry and reproduce the identical failure until the job exhausted
// its attempt budget — turning one bad guess into three wasted builds.
type planTracker struct {
	mu    sync.Mutex
	plans map[string]aiPlanKey
}

func newPlanTracker() *planTracker {
	return &planTracker{plans: make(map[string]aiPlanKey)}
}

func (t *planTracker) set(jobID string, key aiPlanKey) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.plans[jobID] = key
}

// take returns the tracked key and removes it, so a job is only ever
// invalidated once and the map doesn't grow without bound.
func (t *planTracker) take(jobID string) (aiPlanKey, bool) {
	t.mu.Lock()
	defer t.mu.Unlock()
	key, ok := t.plans[jobID]
	delete(t.plans, jobID)
	return key, ok
}

// clear drops any tracked plan for a job that finished successfully.
func (t *planTracker) clear(jobID string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.plans, jobID)
}
