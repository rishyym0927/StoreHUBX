package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	BuildsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "storehubx_builds_total",
		Help: "Total number of build jobs, by terminal status (success|error).",
	}, []string{"status"})

	BuildDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "storehubx_build_duration_seconds",
		Help:    "Time from a build job starting to it reaching a terminal state.",
		Buckets: prometheus.ExponentialBuckets(1, 2, 12), // 1s .. ~68m
	})

	BuildQueueDepth = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "storehubx_build_queue_depth",
		Help: "Number of build jobs currently queued (not yet running).",
	})

	// BuildPlanTotal tracks how build configuration was arrived at. Without
	// this there's no way to see in production how often deterministic
	// detection is missing and the AI fallback or legacy guess is carrying
	// builds instead.
	BuildPlanTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "storehubx_build_plan_total",
		Help: "Build plans by how they were derived (deterministic|deterministic+ai|legacy).",
	}, []string{"source"})

	// BuildSandboxTotal tracks whether builds actually ran isolated. A rising
	// "host" count means sandboxing is silently unavailable on some worker.
	BuildSandboxTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "storehubx_build_sandbox_total",
		Help: "Builds by execution mode (container|host).",
	}, []string{"mode"})
)
